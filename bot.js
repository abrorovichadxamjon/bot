const { Telegraf } = require("telegraf")
const express = require("express")
const cors = require("cors")
const fs = require("fs")

// Bot tokenini o'zgartiring
const bot = new Telegraf("7656007053:AAGSDJ6LZPj5DEiZEnghrWDwg1_5HQWTGJ8")
const app = express()
const PORT = process.env.PORT || 3000

// CORS va JSON middleware
app.use(cors())
app.use(express.json())

// Ma'lumotlar fayli
const PLANS_FILE = "plans.json"

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

// Foydalanuvchi holati
const userStates = {}

// Start buyrug'i
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

// Reja qo'shish
bot.command("add", (ctx) => {
  userStates[ctx.chat.id] = { state: "WAITING_FOR_TIME" }
  ctx.reply("⏰ Reja vaqtini kiriting (HH:MM formatida):\nMasalan: 09:30, 14:15, 20:00")
})

// Rejalarni ko'rish
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

// Rejani o'chirish
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

// Bekor qilish
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

  // Buyruq bo'lsa, o'tkazib yuborish
  if (text.startsWith("/")) return

  // Foydalanuvchi holatiga qarab ishlash
  if (userStates[chatId]) {
    const state = userStates[chatId].state

    if (state === "WAITING_FOR_TIME") {
      // Vaqt formatini tekshirish
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

      // Rejani saqlash
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

          // Rejani topib, active = false qilish
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

// API endpointlari
app.get("/api/plans", (req, res) => {
  const plans = loadPlans()
  res.json(plans)
})

// Botni ishga tushirish
bot
  .launch()
  .then(() => {
    console.log("Bot ishga tushdi!")
  })
  .catch((err) => {
    console.error("Bot ishga tushishda xatolik:", err)
  })

// API serverini ishga tushirish
app.listen(PORT, () => {
  console.log(`API server ${PORT} portda ishga tushdi`)
})

// Xatoliklarni qayta ishlash
process.on("unhandledRejection", (err) => {
  console.error("Qayta ishlanmagan xatolik:", err)
})
