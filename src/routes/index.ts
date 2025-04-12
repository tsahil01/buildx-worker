import express from "express";
import { fileRouter } from "./files";
import { mainRouter } from "./mainControls";
import { exacRouter } from "./exac";

const router = express.Router();

router.use('/', mainRouter);
router.use('/exec', exacRouter)
router.use('/file', fileRouter);

export { router };