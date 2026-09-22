// src/templates/emails.ts

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://food-canvas.vercel.app";

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
      color: #1f2937;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .header {
      background-color: #2F8F46;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .content {
      padding: 40px 30px;
    }
    .content p {
      margin-top: 0;
      margin-bottom: 20px;
      font-size: 16px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button {
      display: inline-block;
      background-color: #2F8F46;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
    .signature {
      font-style: italic;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>FoodCanvas</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Cook. Share. Nourish.</p>
      <p>&copy; ${new Date().getFullYear()} FoodCanvas. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

export const getWelcomeEmailHtml = (userName: string) => {
  return baseTemplate(`
    <p>Hi ${userName},</p>
    <p>Welcome to FoodCanvas! 🎉</p>
    <p>We’re excited to have you with us.</p>
    <p>FoodCanvas is your smart food companion where you can discover recipes, plan meals, track your nutrition, explore food ideas, and connect with a community that loves food.</p>
    <p>Start exploring and make every meal more meaningful.</p>
    <div class="button-container">
      <a href="${APP_URL}/dashboard/users" class="button">Explore FoodCanvas</a>
    </div>
    <p class="signature">— The FoodCanvas Team</p>
  `);
};

export const getInactivity3DayEmailHtml = (userName: string) => {
  return baseTemplate(`
    <p>Hi ${userName},</p>
    <p>It's been a few days since we last saw you on FoodCanvas.</p>
    <p>Your recipes, meal ideas, nutrition tools, and community are waiting for you.</p>
    <p>Come back and discover something delicious today.</p>
    <div class="button-container">
      <a href="${APP_URL}/dashboard/users" class="button">Explore FoodCanvas</a>
    </div>
    <p class="signature">— The FoodCanvas Team</p>
  `);
};

export const getInactivity7DayEmailHtml = (userName: string) => {
  return baseTemplate(`
    <p>Hi ${userName},</p>
    <p>We haven't seen you on FoodCanvas for a while.</p>
    <p>Whether you're looking for a new recipe, planning your next meal, tracking your nutrition, or simply exploring food ideas, FoodCanvas is ready when you are.</p>
    <p>Come back and continue your journey.</p>
    <div class="button-container">
      <a href="${APP_URL}/dashboard/users" class="button">Return to FoodCanvas</a>
    </div>
    <p class="signature">— The FoodCanvas Team</p>
  `);
};

export const getWelcomeEmailText = (userName: string) => `Hi ${userName},

Welcome to FoodCanvas! 🎉

We’re excited to have you with us.
FoodCanvas is your smart food companion where you can discover recipes, plan meals, track your nutrition, explore food ideas, and connect with a community that loves food.

Start exploring and make every meal more meaningful:
${APP_URL}/dashboard/users

Cook. Share. Nourish.
— The FoodCanvas Team`;

export const getInactivity3DayEmailText = (userName: string) => `Hi ${userName},

It's been a few days since we last saw you on FoodCanvas.
Your recipes, meal ideas, nutrition tools, and community are waiting for you.

Come back and discover something delicious today:
${APP_URL}/dashboard/users

Cook. Share. Nourish.
— The FoodCanvas Team`;

export const getInactivity7DayEmailText = (userName: string) => `Hi ${userName},

We haven't seen you on FoodCanvas for a while.
Whether you're looking for a new recipe, planning your next meal, tracking your nutrition, or simply exploring food ideas, FoodCanvas is ready when you are.

Come back and continue your journey:
${APP_URL}/dashboard/users

Cook. Share. Nourish.
— The FoodCanvas Team`;
