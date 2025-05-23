const { Telegraf } = require("telegraf")
const fs = require("fs")
const path = require("path")

// Bot tokenini environment variable dan olish
const bot = new Telegraf(process.env.BOT_TOKEN)

// Ma'lumotlar fayli yo'li
const PLANS_FILE = path.join("/tmp", "plans.json")

// Ma'lumotlarni yuklash
function loadPlans() {
  try {
    if (fs.existsSync(PLANS_FILE)) {
      const data = fs.readFileSync(PLANS_FILE, "utf8")
      return JSON.parse(data)
    }
  } catch (error) {
    console.error("Ma'lumotlarni yuklashda xatolik:", error)
  }
  return { plans: [] }
}

// Ma'lumotlarni saqlash
function savePlans(plans) {
  try {
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2), "utf8")
  } catch (error) {
    console.error("Ma'lumotlarni saqlashda xatolik:", error)
  }
}

// Foydalanuvchi holati (memory da)
const userStates = {}

// Bot buyruqlari
bot.start((ctx) => {
  ctx.reply(
    "👋 Salom! Men rejalaringizni eslatib turuvchi botman.\n\n" +
      "Quyidagi buyruqlardan foydalaning:\n" +
      "/add - Yangi reja qo'shish\n" +
      "/list - Rejalarni ko'rish\n" +
      "/delete - Rejani o'chirish\n" +
      "/cancel - Amalni bekor qilish",
  )
})

bot.command("add", (ctx) => {
  userStates[ctx.chat.id] = { state: "WAITING_FOR_TIME" }
  ctx.reply("⏰ Reja vaqtini kiriting (HH:MM formatida):\nMasalan: 09:30, 14:15, 20:00")
})

bot.command("list", (ctx) => {
  const userId = ctx.from.id
  const plans = loadPlans()
  const userPlans = plans.plans.filter((plan) => plan.userId === userId && plan.active)

  if (userPlans.length === 0) {
    ctx.reply("📋 Sizda hozircha rejalar yo'q.")
    return
  }

  let response = "📋 Sizning rejalaringiz:\n\n"
  userPlans.forEach((plan, index) => {
    response += `${index + 1}. ⏰ ${plan.time} - 📝 ${plan.text}\n`
  })

  ctx.reply(response)
})

bot.command("delete", (ctx) => {
  const userId = ctx.from.id
  const plans = loadPlans()
  const userPlans = plans.plans.filter((plan) => plan.userId === userId && plan.active)

  if (userPlans.length === 0) {
    ctx.reply("❌ O'chiriladigan rejalar yo'q.")
    return
  }

  let response = "🗑️ Qaysi rejani o'chirmoqchisiz?\n\n"
  userPlans.forEach((plan, index) => {
    response += `${index + 1}. ⏰ ${plan.time} - 📝 ${plan.text}\n`
  })

  response += "\nReja raqamini yuboring (masalan: 1, 2, 3...)"
  ctx.reply(response)

  userStates[ctx.chat.id] = {
    state: "DELETING_PLAN",
    plans: userPlans,
  }
})

bot.command("cancel", (ctx) => {
  if (userStates[ctx.chat.id]) {
    delete userStates[ctx.chat.id]
    ctx.reply("❌ Amal bekor qilindi.")
  } else {
    ctx.reply("❓ Hozirda faol amal yo'q.")
  }
})

// Xabarlarni qayta ishlash
bot.on("text", (ctx) => {
  const chatId = ctx.chat.id
  const text = ctx.message.text

  if (text.startsWith("/")) return

  if (userStates[chatId]) {
    const state = userStates[chatId].state

    if (state === "WAITING_FOR_TIME") {
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/
      if (timeRegex.test(text)) {
        userStates[chatId] = {
          state: "WAITING_FOR_TEXT",
          time: text,
        }
        ctx.reply("📝 Endi rejangizni kiriting:")
      } else {
        ctx.reply("❌ Noto'g'ri format. Iltimos, vaqtni HH:MM formatida kiriting (masalan 14:30):")
      }
    } else if (state === "WAITING_FOR_TEXT") {
      const time = userStates[chatId].time
      const userId = ctx.from.id
      const username = ctx.from.username || "user"

      const plans = loadPlans()
      const newPlan = {
        id: Date.now(),
        userId: userId,
        username: username,
        time: time,
        text: text,
        created: new Date().toISOString(),
        active: true,
      }

      plans.plans.push(newPlan)
      savePlans(plans)

      ctx.reply(`✅ Reja saqlandi!\n⏰ Vaqt: ${time}\n📝 Reja: ${text}`)
      delete userStates[chatId]
    } else if (state === "DELETING_PLAN") {
      try {
        const planIndex = Number.parseInt(text) - 1
        const userPlans = userStates[chatId].plans

        if (planIndex >= 0 && planIndex < userPlans.length) {
          const planToDelete = userPlans[planIndex]
          const plans = loadPlans()

          const planInList = plans.plans.find((p) => p.id === planToDelete.id)
          if (planInList) {
            planInList.active = false
            savePlans(plans)
            ctx.reply(`✅ Reja o'chirildi:\n⏰ ${planToDelete.time} - 📝 ${planToDelete.text}`)
          } else {
            ctx.reply("❌ Reja topilmadi.")
          }
        } else {
          ctx.reply("❌ Noto'g'ri raqam. Qaytadan urinib ko'ring.")
        }
      } catch (e) {
        ctx.reply("❌ Iltimos, faqat raqam kiriting.")
      }

      delete userStates[chatId]
    }
  } else {
    ctx.reply(
      "Buyruqlardan foydalaning:\n" +
        "/add - Yangi reja qo'shish\n" +
        "/list - Rejalarni ko'rish\n" +
        "/delete - Rejani o'chirish",
    )
  }
})

// Webhook handler
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // Telegram webhook
      await bot.handleUpdate(req.body)
      res.status(200).json({ ok: true })
    } else if (req.method === "GET") {
      // API endpoint - rejalarni olish
      const plans = loadPlans()
      res.status(200).json(plans)
    } else {
      res.status(405).json({ error: "Method not allowed" })
    }
  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
