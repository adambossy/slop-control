import express from "express";
import { z } from "zod";
import { validateBody } from "./validation.js";

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const RefSchema = z.object({ ref: z.string().min(1) });

app.post("/echo", validateBody(RefSchema), (req, res) => {
  const body = (req as any).validatedBody as { ref: string };
  res.status(200).json({ ok: true, ref: body.ref });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
