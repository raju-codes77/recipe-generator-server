// Groq text-only, so image comes from a free source based on AI's imageQuery
export function getRecipeImageUrl(imageQuery: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(imageQuery + ' dish food plating')}?width=800&height=600&nologo=true`;
}