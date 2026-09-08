fetch('http://localhost:5000/api/pantry-to-plate/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ingredients: ['chicken'],
    cuisine: 'Bangladeshi',
    mealType: 'Breakfast',
    cookingTime: 'Up to 30 min',
    diet: 'Vegetarian',
    servings: '1',
    selectedOptions: []
  })
})
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
