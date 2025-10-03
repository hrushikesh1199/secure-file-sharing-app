const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const File = require("../models/File");

// Storage config
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Upload and encrypt file
router.post("/upload", upload.single("file"), async (req, res) => {
    try {
        const filePath = `uploads/${req.file.filename}`;
        const encryptedPath = `uploads/encrypted-${req.file.filename}`;

        // Read the uploaded file
        const fileBuffer = fs.readFileSync(filePath);

        // Encrypt the file using AES-256-CBC
        const cipher = crypto.createCipheriv(
            "aes-256-cbc",
            Buffer.from(process.env.JWT_SECRET.padEnd(32).slice(0, 32)), // 32-byte key
            Buffer.from(process.env.JWT_SECRET.padEnd(16).slice(0, 16))  // 16-byte IV
        );
        const encryptedData = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);

        // Save encrypted file
        fs.writeFileSync(encryptedPath, encryptedData);

        // Remove the original file
        fs.unlinkSync(filePath);

        // Save file info to database
        const file = new File({
            filename: `encrypted-${req.file.filename}`,
            originalName: req.file.originalname,
            uploadedBy: req.body.userId  // replace with auth later if needed
        });

        await file.save();
        res.json({ msg: "File uploaded and encrypted successfully", file });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;


// Download and decrypt file
router.get("/download/:id", async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).send("File not found");

        const encryptedPath = `uploads/${file.filename}`;
        if (!fs.existsSync(encryptedPath)) return res.status(404).send("File missing on server");

        // Read encrypted file
        const encryptedData = fs.readFileSync(encryptedPath);

        // Decrypt using same key and IV
        const decipher = crypto.createDecipheriv(
            "aes-256-cbc",
            Buffer.from(process.env.JWT_SECRET.padEnd(32).slice(0, 32)),
            Buffer.from(process.env.JWT_SECRET.padEnd(16).slice(0, 16))
        );
        const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

        // Send decrypted file as download
        res.set({
            "Content-Disposition": `attachment; filename="${file.originalName}"`,
            "Content-Type": "application/octet-stream"
        });
        res.send(decryptedData);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

