require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { WebhookClient } = require('dialogflow-fulfillment');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// ────────────────────────────────────────────────
//  Environment variables check
// ────────────────────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn('Missing SUPABASE_URL or SUPABASE_KEY in .env - Database features will be disabled');
}

// Hardcoded API Key for Gemini as per original file, though env var is preferred
const GEMINI_API_KEY = "AIzaSyC0El0Cxp-tAGj1Zx5rZAllypZr4Fzst78";
if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
}

// ────────────────────────────────────────────────
//  Initialize clients
// ────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const MODEL_NAME = 'gemini-1.5-flash';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: "bilal317699@gmail.com",
        pass: "khrc vion ltiv hdvi",
    },
});

// ────────────────────────────────────────────────
//  Express setup
// ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const PORT = process.env.PORT || 5000;

// Simple status route
app.get('/', (req, res) => {
    res.send('Dialogflow + Gemini + Supabase + Email webhook server is running');
});

// Middleware to log requests
app.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    next();
});

// ────────────────────────────────────────────────
//  Gemini helper function
// ────────────────────────────────────────────────
async function getGeminiResponse(queryText) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const generationConfig = {
            temperature: 1,
            topK: 0,
            topP: 0.95,
            maxOutputTokens: 200,
        };
        const chat = model.startChat({ generationConfig, history: [] });
        const result = await chat.sendMessage(queryText);
        const response = await result.response;
        return response.text().trim();
    } catch (err) {
        console.error('Gemini error:', err);
        return "I am currently unable to process that. Please try again later.";
    }
}

// ────────────────────────────────────────────────
//  Email helper function
// ────────────────────────────────────────────────
async function sendEmailAsync(to, subject, text) {
    const message = {
        from: '"Saylani Bot" <bilal317699@gmail.com>',
        to,
        subject,
        text,
        html: text.replace(/\n/g, "<br>"),
    };

    try {
        const info = await transporter.sendMail(message);
        console.log(`Email sent to ${to} →`, info.messageId);
    } catch (err) {
        console.error('Failed to send email:', err);
    }
}

// ────────────────────────────────────────────────
//  Main webhook endpoint
// ────────────────────────────────────────────────
app.post('/dialogflow', async (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });

    let sessionId = 'unknown';
    if (req.body.session && req.body.session.length > 43) {
        sessionId = (req.body.session).substr(43);
    } else if (req.body.session) {
        sessionId = req.body.session.split('/').pop();
    }
    console.log(`Webhook called — session: ${sessionId}`);

    // ── Welcome ─────────────────────────────────────
    function welcome(agent) {
        agent.add("Assalam-o-Alaikum! Welcome to Saylani Welfare. I am your virtual assistant. How may I assist you today? You can ask about Roti Bank, Donations, IT Registration, or Locations.");
    }

    // ── Roti Bank Info Intent ───────────────────────
    function rotiBankInfo(agent) {
        console.log("Handling RotiBank_Info");
        agent.add("Saylani Roti Bank is a flagship initiative providing free meals to the needy. We feed over 300,000+ people daily across 630+ locations in Pakistan, ensuring no one goes to bed hungry.");
    }

    // ── Locations Intent ────────────────────────────
    function locations(agent) {
        agent.add("We have a wide network across major cities including Karachi, Lahore, Islamabad, Faisalabad, and Hyderabad. For the nearest center's exact location, please call our UAN: 111-729-526.");
    }

    // ── Donation Intent ─────────────────────────────
    async function donation(agent) {
        const choice = (agent.parameters.Donation || "").toString();
        const query = agent.query;

        const message = `JazakAllah Khair! To contribute to our cause (${choice || "General Donation"}):\n` +
            "1. Bank Transfer\n2. Online via website (saylaniwelfare.com)\n3. Visit any of our global centers.\n\nYour support helps us serve humanity better.";

        // Logic: Send Email + Save to DB (Fire-and-forget for speed)
        (async () => {
            sendEmailAsync("bilal317693@gmail.com", "New Donation Query", `User interested in: ${choice}\nQuery: ${query}`);
            if (supabase) {
                const { error } = await supabase
                    .from('donations')
                    .insert([{ type: choice, query: query, date: new Date() }]);
                if (error) console.error("Supabase Donation Error:", error);
            }
        })();

        agent.add(message);
    }

    // ── IT Registration Intent ──────────────────────
    async function itRegistration(agent) {
        const { person, Courses, email, phone } = agent.parameters;
        const name = person && person.name ? person.name : (person || "Student");

        const responseText = `Thank you, ${name}. We have received your interest in the ${Courses} course.\nOur team will review your request and contact you at ${phone} or ${email} shortly.\nStay tuned for updates!`;

        // Logic: Send Email + Save to DB (Fire-and-forget for speed)
        (async () => {
            sendEmailAsync("bilal317693@gmail.com", "New IT Registration", `Name: ${name}\nCourse: ${Courses}\nPhone: ${phone}\nEmail: ${email}`);

            if (email && email.includes("@")) {
                sendEmailAsync(email, "Registration Received - Saylani Mass IT", responseText);
            }

            if (supabase) {
                const { error } = await supabase
                    .from('it_registrations')
                    .insert([{
                        name: name,
                        course: Courses,
                        email: email,
                        phone: phone,
                        created_at: new Date()
                    }]);
                if (error) console.error("Supabase IT Registration Error:", error);
            }
        })();

        agent.add(responseText);
    }

    // ── Book Appointment Intent ─────────────────────
    function bookAppointment(agent) {
        const message = "You can easily book an appointment with us:\n\n" +
            "1. Call our UAN: 021-111-729-526\n" +
            "2. For IT Training, visit: https://www.saylanimit.com\n" +
            "3. For general queries, email: info@saylaniwelfare.com\n\n" +
            "We look forward to hearing from you!";
        agent.add(message);
    }

    // ── Fallback / Unknown ──────────────────────────
    async function fallback(agent) {
        let queryText = req.body.queryResult.queryText;
        console.log(`Fallback processing for: ${queryText}`);

        try {
            const result = await Promise.race([
                getGeminiResponse(queryText),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
            ]);
            console.log("Gemini Response:", result);
            agent.add(result);
        } catch (err) {
            console.error("Gemini/Timeout Error:", err);
            agent.add("I apologize, but I am ensuring a quick response and your request took a bit too long. Could you please rephrase or ask again?");
        }
    }

    // ── Intent Mapping ──────────────────────────────
    const intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('RotiBank_Info', rotiBankInfo);
    intentMap.set('RotiBank_Location', locations);
    intentMap.set('RotiBank_Donate', donation);
    intentMap.set('IT_Registration', itRegistration);
    intentMap.set('BookAppointment', bookAppointment);

    try {
        await agent.handleRequest(intentMap);
    } catch (err) {
        console.error("Critical Webhook Error:", err.message);
        if (!res.headersSent) {
            return res.json({
                fulfillmentText: "I'm having a technical issue, but I'm here to help. Could you try asking that again?"
            });
        }
    }
});

// ────────────────────────────────────────────────
//  Start server
// ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}   →   http://localhost:${PORT}/`);
    console.log(`Webhook endpoint:                 /dialogflow`);
});