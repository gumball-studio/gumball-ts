import { GumballClient } from "gumball-ai";

// Minimal end-to-end: key in, image out. Run with:
//   GB_API_KEY=gb_YOUR_KEY node examples/quickstart.ts
const client = new GumballClient({ apiKey: process.env.GB_API_KEY ?? "" });

const shoot = await client.generations.create({
  image_url: "https://cdn.yourstore.com/products/dress.jpg",
  tool: "model",
  scene: "studio",
  prompt: "soft window light, editorial styling",
});
console.log("queued:", shoot.id);

const done = await client.generations.waitForCompletion(shoot.id);
for (const image of done.images) {
  console.log(image.status, image.url);
}
