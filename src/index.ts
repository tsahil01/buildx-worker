import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello from BuildX Worker");
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});