const ch = require("cheerio");
const CronJob = require("cron").CronJob;
const nodemailer = require("nodemailer");
const axios = require("axios");
const mongoose = require("mongoose");

const { Telegraf } = require("telegraf");
const WizardScene = require("telegraf/scenes/wizard");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_PASS = process.env.SENDER_PASS;
const MONGO_URI = process.env.MONGO_URI;

const missingConfig = ["BOT_TOKEN", "MONGO_URI"].filter((key) => !process.env[key]);
if (missingConfig.length) {
  console.error(`Missing required environment variables: ${missingConfig.join(", ")}`);
  process.exit(1);
}

const Product = require("./models/product.js");
const User = require("./models/user.js");

const bot = new Telegraf(BOT_TOKEN);
bot.catch((error, ctx) => {
  console.error("Telegram update failed:", error.message);
  if (ctx && ctx.chat) {
    ctx.reply("Something went wrong. Please try again later.").catch(() => {});
  }
});

bot.use(session());

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).catch((error) => {
  console.error("MongoDB connection failed:", error.message);
  process.exit(1);
});

mongoose.connection.on("connected", () => {
  console.log("db connected");
  startTracking();
});
mongoose.connection.on("error", (error) => console.error("MongoDB connection error:", error.message));

let amazonClasses = [
  "#priceblock_saleprice",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
];
let flipkartClasses = ["._30jeq3"];

/* --------------------- wizard scenes ---------------------- */

const newUserWizard = new WizardScene(
  "newUser",
  async (ctx) => {
    await ctx.replyWithMarkdown(
      "*Please enter the email you want to be notified to*"
    );
    ctx.wizard.state.userid = ctx.chat.id;
    return ctx.wizard.next();
  },
  async (ctx) => {
    const email = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await ctx.reply("Please enter a valid email address.");
      return;
    }
    ctx.wizard.state.email = email;
    await bot.telegram.sendMessage(ctx.chat.id, "CLICK ON BELOW BUTTON(s) TO:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Add a Product", callback_data: "addProductBtn" }],
          [{ text: "BOT's Manual page", callback_data: "helpBtn" }],
        ],
      },
    });
    await addUser(ctx.wizard.state);
    return ctx.scene.leave();
  }
);

const addProductWizard = new WizardScene(
  "addProduct",
  async (ctx) => {
    await ctx.replyWithMarkdown("*Please enter the link of the product*");
    ctx.wizard.state.userid = ctx.chat.id;
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!isValidURL(ctx.message.text)) {
      await ctx.replyWithMarkdown("*Invalid URL!*");
      return ctx.scene.leave();
    }
    ctx.wizard.state.url = ctx.message.text;

    try {
      ctx.wizard.state.name = await getProductName(ctx.wizard.state.url);
      ctx.wizard.state.initPrice = await curPrice(ctx.wizard.state.url);
      if (!ctx.wizard.state.name || !Number.isFinite(ctx.wizard.state.initPrice) || ctx.wizard.state.initPrice <= 0) {
        await ctx.reply("I couldn't read the product name or current price. The store may have blocked the request or changed its page. Please try another product URL later.");
        return ctx.scene.leave();
      }
      await ctx.replyWithMarkdown(`*Product is* ${ctx.wizard.state.name}`);
      await ctx.replyWithMarkdown(`Current price is *${ctx.wizard.state.initPrice}rs*`);
    } catch (error) {
      console.error("Product lookup failed:", error.message);
      await ctx.reply("Unable to read this product right now. Please try again later.");
      return ctx.scene.leave();
    }
    await ctx.replyWithMarkdown(
      "*Enter the price you want to be notified for*"
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const targetPrice = Number(ctx.message.text);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      await ctx.reply("Please enter a valid target price greater than zero.");
      return ctx.scene.leave();
    }
    ctx.wizard.state.dropPrice = targetPrice;
    await ctx.replyWithMarkdown(
      `*Alert added for ${ctx.wizard.state.dropPrice}rs*`
    );
    try {
      await addProduct(ctx.scene.state);
      await ctx.reply("Price alert saved.");
      await handleBtncmd(ctx);
    } catch (error) {
      await ctx.reply("I couldn't save this alert. Please send /start and try again.");
    }

    return ctx.scene.leave();
  }
);

const deleteWizard = new WizardScene(
  "deleteProduct",
  async (ctx) => {
    await ctx.replyWithHTML("★★★ work of @victorakaps ★★★");
    await ctx.replyWithMarkdown(
      "Send The *4-Digit code* of the product that you want to remove.(Send *q* to exit)"
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text.toLowerCase() === "q") {
      return ctx.scene.leave();
    } else {
      const uniqid = ctx.message.text;
      Product.findOne({ uniqid }).exec((err, product) => {
        if (err || !product) {
          ctx.replyWithMarkdown("*Something went wrong!*");
          console.log(err);
        } else {
          product
            .remove()
            .then((product) => {
              ctx.replyWithMarkdown(`*Removed* ${product.name}`);
              handleBtncmd(ctx);
            })
            .catch((err) => {
              console.log(err);
            });
        }
      });
    }
    return ctx.scene.leave();
  }
);

/* ----------------------------------------------------------------- */

const stage = new Stage([newUserWizard, addProductWizard, deleteWizard]);
bot.use(stage.middleware());

/* -------------------------- bot events --------------------------- */

bot.start(async (ctx) => {
  ctx.scene.enter("newUser");
});

bot.command("add", (ctx) => {
  ctx.scene.enter("addProduct");
});

bot.command("kick", (ctx) => {
  handleKickcmd(ctx);
});

bot.command("log", async (ctx) => {
  handleLogging(ctx);
});

bot.command("list", async (ctx) => {
  handleDeletecmd(ctx);
});

bot.command("help", async (ctx) => {
  handleHelp(ctx);
});

bot.command("btn", async (ctx) => {
  handleBtncmd(ctx);
});

bot.action("addProductBtn", (ctx) => {
  ctx.deleteMessage();
  ctx.scene.enter("addProduct");
});

bot.action("deleteBtn", (ctx) => {
  ctx.deleteMessage();
  handleDeletecmd(ctx);
});

bot.action("kickBtn", (ctx) => {
  ctx.deleteMessage();
  handleKickcmd(ctx);
});
bot.action("helpBtn", (ctx) => {
  ctx.deleteMessage();
  handleHelp(ctx);
});

/* -------------------------------------------------------------------- */

/* ----------------------- command handlers --------------------------- */

const handleBtncmd = async (ctx) => {
  bot.telegram.sendMessage(ctx.chat.id, "CLICK ON BELOW BUTTON(s) TO:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Add a Product for tracking",
            callback_data: "addProductBtn",
          },
        ],
        [
          {
            text: "Display Or Delete saved product(s)",
            callback_data: "deleteBtn",
          },
        ],
        [
          {
            text: "Resume/Pause Notifications",
            callback_data: "kickBtn",
          },
        ],
        [{ text: "BOT's Manual page", callback_data: "helpBtn" }],
      ],
    },
  });
};

const handleKickcmd = async (ctx) => {
  try {
    const user = await User.findOne({ userid: ctx.chat.id });
    if (!user) {
      await ctx.reply("Send /start first to register before changing notification settings.");
      return;
    }
    user.pause = !user.pause;
    await user.save();
    await ctx.replyWithMarkdown(`*Tracking ${user.pause ? "Paused" : "Resumed"}*`);
  } catch (error) {
    console.error("Unable to change tracking state:", error.message);
    await ctx.reply("Unable to update tracking right now. Please try again.");
  }
};

const handleDeletecmd = async (ctx) => {
  Product.find({ userid: ctx.chat.id }).then(async (products) => {
    if (products.length) {
      products.forEach(async (product, i) => {
        await ctx.replyWithMarkdown(
          `☛ ${product.name.slice(0, 40)} CODE => *${product.uniqid}*`
        );
      });
      ctx.scene.enter("deleteProduct");
    } else {
      await ctx.replyWithHTML(
        "★ Tracking list is Empty use /add command to track products. ★"
      );
      await ctx.replyWithHTML("★★★ work of @victorakaps ★★★");
      handleBtncmd(ctx);
    }
  });
};

const handleHelp = async (ctx) => {
  ctx.replyWithMarkdown(
    "*ALL AVAILABLE COMMANDS:*\n✔ USE /add command to track a product \n✔USE /list command to display and delete product(s)\n✔USE /kick command to pause the notifications."
  );
  handleBtncmd(ctx);
};

const handleLogging = async (ctx) => {
  if (ctx.chat.id == 601430671) {
    User.find().then((users) => {
      let userStr = users.map(({ email, userid }) => ({ email, userid }));
      bot.telegram.sendMessage(601430671, userStr);
    });
  }
};

/* ---------------------------------------------------------------------- */

/* ---------------------- Utility functions ----------------------------- */

async function getProductName(url) {
  let key;
  let productName;
  url.includes("amazon") ? (key = "#title") : (key = ".B_NuCI");
  let response;
  await axios({
    method: "get",
    url: url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  }).then((res) => (response = res.data));
  ch(key, response).each(function () {
    productName = ch(this).text().trim();
  });
  return productName;
}

async function scrapPrice(key, response) {
  let price;
  ch(key, response).each(function () {
    price = ch(this).text();
    price = Number(price.replace(/[^0-9.-]+/g, ""));
  });
  return price;
}

async function curPrice(url) {
  let isAmazon = url.includes("amazon");
  let price;

  let response;
  await axios({
    method: "get",
    url: url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  }).then((res) => (response = res.data));
  if (isAmazon) {
    for (let i = 0; i < amazonClasses.length; i++) {
      price = await scrapPrice(amazonClasses[i], response);
      if (price) {
        break;
      } else {
        continue;
      }
    }
  } else {
    for (let i = 0; i < flipkartClasses.length; i++) {
      price = await scrapPrice(flipkartClasses[i], response);
      if (price) {
        break;
      } else {
        continue;
      }
    }
  }
  return price;
}

function isValidURL(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const allowed = ["amazon.in", "amazon.com", "flipkart.com"];
    return parsed.protocol === "https:" &&
      allowed.some((domain) => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

const trackPrices = async () => {
  try {
    const pendingFilter = { $or: [{ notified: false }, { notified: { $exists: false } }] };
    const products = await Product.find(pendingFilter);
    for (const product of products) {
      try {
        const currentPrice = await curPrice(product.url);
        if (Number.isFinite(currentPrice) && currentPrice > 0 && currentPrice <= product.dropPrice) {
          const claimed = await Product.findOneAndUpdate(
            { _id: product._id, $or: [{ notified: false }, { notified: { $exists: false } }] },
            { $set: { notified: true } },
            { new: true }
          );
          if (claimed) {
            await sendNotification(
              product.name.slice(0, 40),
              currentPrice,
              product.url,
              product.email,
              product.userid
            );
          }
        }
      } catch (error) {
        console.error("Price check failed for a tracked item:", error.message);
      }
    }
  } catch (error) {
    console.error("Unable to load tracked products:", error.message);
  }
};

async function sendNotification(name, nowPrice, url, email, userid) {
  try {
    const user = await User.findOne({ userid });
    if (!user || user.pause) return;

    await bot.telegram.sendMessage(
      userid,
      `Price of ${name} dropped to ₹${nowPrice}. Buy: ${url}`
    );
    await sendEmail(name, nowPrice, url, email);
  } catch (error) {
    console.error("Notification failed:", error.message);
  }
}

async function sendEmail(name, nowPrice, url, email) {
  if (!SENDER_EMAIL || !SENDER_PASS || !email) {
    console.log("Email alerts skipped: SMTP credentials or recipient email are not configured.");
    return;
  }
  try {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
      },
    });
    let textToSend = `Price of ${name} has dropped to ${nowPrice}Rs., thanks for using VictorBot(s)`;
    let htmlText = `<a href=\"${url}\">Click Here To Buy Now</a>`;
    let info = await transporter.sendMail({
      from: `"Victor Price Tracker" <${SENDER_EMAIL}>`,
      to: email,
      subject: "Price dropped to " + nowPrice,
      text: textToSend,
      html: htmlText,
    });
  } catch (err) {
    console.error(err);
  }
}

const addUser = async ({ email, userid }) => {
  try {
    const user = await User.findOneAndUpdate(
      { userid },
      { $set: { email }, $setOnInsert: { pause: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("User registered or updated:", user.userid);
  } catch (error) {
    console.error("Unable to save Telegram user:", error.message);
    throw error;
  }
};

const addProduct = async ({ url, userid, name, initPrice, dropPrice }) => {
  try {
    const user = await User.findOne({ userid });
    if (!user) {
      throw new Error("User is not registered. Send /start first.");
    }
    let uniqid = "";
    const possible = "123456789";
    for (let i = 0; i < 4; i++) {
      const digit = Math.floor(Math.random() * possible.length);
      uniqid += possible.charAt(digit);
    }
    const product = new Product({
      url,
      userid,
      name,
      initPrice,
      dropPrice,
      email: user.email,
      uniqid,
      notified: false,
    });
    await product.save();
    console.log("Added tracked product:", product._id);
  } catch (error) {
    console.error("Unable to add tracked product:", error.message);
    throw error;
  }
};

async function startTracking() {
  let job = new CronJob(
    "*/5 * * * *", // checking every 5 minutes
    function () {
      trackPrices();
    },
    null,
    true,
    null,
    null,
    true
  );
  job.start();
}

/* ------------------------------------------------------------- */

bot.launch().then(() => console.log("Telegram bot started")).catch((error) => {
  console.error("Telegram bot failed to start:", error.message);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
