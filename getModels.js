require('dotenv').config();

fetch('https://api.groq.com/openai/v1/models', {
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY_PLATE_AI}`
  }
})
  .then(res => res.json())
  .then(data => console.log(data.data ? data.data.map(m => m.id) : data))
  .catch(console.error);

