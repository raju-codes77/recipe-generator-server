import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function main() {
  try {
    const models = await groq.models.list();
    console.log("Available models:");
    models.data.forEach((model) => console.log(model.id));
  } catch (err: any) {
    console.error("Error:", err.message, err.error);
  }
}
main();
