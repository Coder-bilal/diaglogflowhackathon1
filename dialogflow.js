const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
const dialogflow = require('@google-cloud/dialogflow');
const { WebhookClient, Payload } = require('dialogflow-fulfillment');
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const MODEL_NAME = "gemini-flash-latest";
const API_KEY = "AIzaSyC0El0Cxp-tAGj1Zx5rZAllypZr4Fzst78";

async function runChat(queryText) {
    const genAI = new GoogleGenerativeAI(API_KEY);
    // console.log(genAI)
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
        temperature: 1,
        topK: 0,
        topP: 0.95,
        maxOutputTokens: 200,
    };

    const chat = model.startChat({
        generationConfig,
        history: [
        ],
    });

    const result = await chat.sendMessage(queryText);
    const response = result.response;
    return response.text();
}

const webApp = express();
const PORT = process.env.PORT || 5000;

webApp.use(express.urlencoded({
    extended: true
}));
webApp.use(express.json());
webApp.use(cors());

webApp.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    next();
});

webApp.get('/', (req, res) => {
    res.sendStatus(200);
    res.send("Status Okay")
});

webApp.post('/dialogflow', async (req, res) => {

    var id = (res.req.body.session).substr(43);
    console.log(id)
    const agent = new WebhookClient({
        request: req,
        response: res
    });

    // --- EMAIL CONFIGURATION (Included for your other intents) ---
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: "bilal317699@gmail.com", pass: "khrc vion ltiv hdvi" },
    });

    // Async Email Helper
    function sendEmailAsync(to, subject, text) {
        (async () => {
            try {
                await transporter.sendMail({
                    from: '"Saylani Bot" <bilal317699@gmail.com>',
                    to, subject, text, html: text.replace(/\n/g, "<br>")
                });
                console.log(`Email sent to ${to}`);
            } catch (e) { console.error(e); }
        })();
    }

    // --- INTENT HANDLERS ---

    async function fallback(agent) {
        let action = req.body.queryResult.action;
        let queryText = req.body.queryResult.queryText;

        if (action === 'input.unknown') {
            let result = await runChat(queryText);
            agent.add(result);
            console.log(result)
        } else {
            // Default fallback logic if not explicitly 'input.unknown' but still landed here
            let result = await runChat(queryText);
            agent.add(result);
            console.log(result)
        }
    }

    function hi(agent) {
        console.log(`intent  =>  hi`);
        agent.add('Hi, I am your virtual assistant, Tell me how can I help you')
    }

    // --- SUPABASE CONFIGURATION ---
    require('dotenv').config();
    const { createClient } = require('@supabase/supabase-js');

    // Make sure to create a .env file with SUPABASE_URL and SUPABASE_KEY
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // --- HELPERS (Chips & Rich Content) ---
    function getChips(excludeIntent) {
        const options = [
            { text: "ℹ️ About Our Services", intent: "RotiBank_Info" },
            { text: "📍 Find Centers", intent: "RotiBank_Location" },
            { text: "💰 Make a Donation", intent: "RotiBank_Donate" },
            { text: "🎓 IT Course Registration", intent: "IT_Registration" },
            { text: "📅 Book Appointment", intent: "BookAppointment" }
        ];
        return options.filter(o => o.intent !== excludeIntent).map(o => ({ text: o.text }));
    }

    function addChips(agent, text, excludeIntent) {
        agent.add(text);
        agent.add(new Payload(agent.UNSPECIFIED, {
            richContent: [[
                { type: "chips", options: getChips(excludeIntent) }
            ]]
        }, { sendAsMessage: true, rawPayload: true }));
    }

    // --- INTENT HANDLERS ---

    function rotiBankInfo(agent) {
        agent.add(new Payload(agent.UNSPECIFIED, {
            richContent: [[
                {
                    type: "image",
                    rawUrl: "https://i.pinimg.com/736x/9c/9a/ef/9c9aefcf49d7f51f9be204b650e7362e.jpg",
                    accessibilityText: "Saylani Logo"
                },
                {
                    type: "info",
                    title: "Saylani Dastarkhwan",
                    subtitle: "Feeding 300,000+ daily"
                },
                {
                    type: "description",
                    text: [
                        "We provide fresh meals twice a day to thousands of people across 630+ centers in Pakistan."
                    ]
                },
                { type: "chips", options: getChips("RotiBank_Info") }
            ]]
        }, { sendAsMessage: true, rawPayload: true }));
    }

    function locations(agent) {
        addChips(agent,
            "We have presence in Karachi, Lahore, Islamabad, Faisalabad and Hyderabad.\nCall 111-729-526 for the nearest center.",
            "RotiBank_Location"
        );
    }

    async function donation(agent) {
        const choice = (agent.parameters.Donation || "").toString();

        let message = `JazakAllah! To donate (${choice || "General"}):\n` +
            "1. Bank Transfer\n2. Online (saylaniwelfare.com)\n3. Visit any center.";

        // Send Email Async
        sendEmailAsync("bilal317693@gmail.com", "New Donation Query", `User interested in: ${choice}\nQuery: ${agent.query}`);

        // Save to Supabase
        const { error } = await supabase
            .from('donations')
            .insert([{ type: choice, query: agent.query, date: new Date() }]);

        if (error) console.error("Supabase Donation Error:", error);

        addChips(agent, message, "RotiBank_Donate");
    }

    async function itRegistration(agent) {
        const { person, Courses, email, phone } = agent.parameters;
        let name = "Student";
        if (person && person.name) name = person.name;
        else if (person) name = person;

        const responseText = `Thank you ${name}.\nReceived request for: ${Courses}\nWe will contact you at ${phone} or ${email}.`;

        // Send Emails Async
        sendEmailAsync("bilal317693@gmail.com", "New IT Registration", `Name: ${name}\nCourse: ${Courses}\nPhone: ${phone}\nEmail: ${email}`);

        if (email && email.includes("@")) {
            sendEmailAsync(email, "Registration Received - Saylani Mass IT", responseText);
        }

        // Save to Supabase
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

        addChips(agent, responseText, "IT_Registration");
    }

    function bookAppointment(agent) {
        const message = "You can book an appointment or consultation with the Saylani team:\n\n" +
            "1. Visit our official Calendly (if available) or call directly:\n" +
            "   UAN: 021-111-729-526\n" +
            "2. For IT Training related queries, register online:\n" +
            "   https://www.saylanimit.com/enroll\n" +
            "3. General meetings: Email us at saylanimass@gmail.com or call the UAN.\n\n" +
            "JazakAllah! We'll get back to you soon.";

        addChips(agent, message, "BookAppointment");
    }

    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', hi);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('RotiBank_Info', rotiBankInfo);
    intentMap.set('RotiBank_Location', locations);
    intentMap.set('RotiBank_Donate', donation);
    intentMap.set('IT_Registration', itRegistration);
    intentMap.set('BookAppointment', bookAppointment);

    agent.handleRequest(intentMap);
});

webApp.listen(PORT, () => {
    console.log(`Server is up and running at http://localhost:${PORT}/`);
});