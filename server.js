const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure directories exist
fs.ensureDirSync('uploads');
fs.ensureDirSync('processed');
fs.ensureDirSync('public');

// Configuration using environment variables
const DISCORD_CONFIG = {
    token: process.env.DISCORD_USER_TOKEN,
    channelId: process.env.DISCORD_CHANNEL_ID,
    apiUrl: 'https://discord.com/api/v9'
};

// Validate configuration
if (!DISCORD_CONFIG.token || !DISCORD_CONFIG.channelId) {
    console.error('❌ Discord configuration missing! Please check your .env file.');
    console.error('Required: DISCORD_USER_TOKEN and DISCORD_CHANNEL_ID');
    process.exit(1);
}

// Multer configuration for file uploads (now supports videos)
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const imageTypes = /jpeg|jpg|png|gif|webp|bmp|tiff/;
        const videoTypes = /mp4|avi|mov|wmv|flv|webm|mkv|m4v/;
        const extname = path.extname(file.originalname).toLowerCase();
        const mimetype = file.mimetype;
        
        const isImage = imageTypes.test(extname.slice(1)) && mimetype.startsWith('image/');
        const isVideo = videoTypes.test(extname.slice(1)) && mimetype.startsWith('video/');
        
        if (isImage || isVideo) {
            return cb(null, true);
        } else {
            cb('Error: Images and Videos Only!');
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for videos
});

// Load or create gallery data
function loadGalleryData() {
    const dataPath = 'gallery-data.json';
    if (fs.existsSync(dataPath)) {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    return { 
        files: [], 
        stats: {
            totalFiles: 0,
            totalSize: '0 MB',
            videoCount: 0,
            imageCount: 0,
            lastUpdated: new Date().toISOString()
        }
    };
}

function calculateStats(files) {
    const totalFiles = files.length;
    const videoCount = files.filter(item => item.type === 'video').length;
    const imageCount = files.filter(item => item.type === 'image').length;
    const totalSizeBytes = files.reduce((sum, item) => sum + (item.size || 0), 0);
    const totalSize = (totalSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
    
    return {
        totalFiles,
        totalSize,
        videoCount,
        imageCount,
        lastUpdated: new Date().toISOString()
    };
}

function saveGalleryData(data) {
    // Calculate and update stats before saving
    data.stats = calculateStats(data.files);
    fs.writeFileSync('gallery-data.json', JSON.stringify(data, null, 2));
}

// Convert image to optimized format
async function processImage(inputPath, outputPath) {
    await sharp(inputPath)
        .resize(1920, 1080, { 
            fit: 'inside', 
            withoutEnlargement: true 
        })
        .jpeg({ 
            quality: 85, 
            progressive: true 
        })
        .toFile(outputPath);
}

// Process video (just copy for now - you could add ffmpeg for compression)
async function processVideo(inputPath, outputPath) {
    // For now, just copy the video file
    // In the future, you could use ffmpeg to compress/optimize videos
    await fs.copy(inputPath, outputPath);
}

// Determine file type
function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const imageTypes = ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
    const videoTypes = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'];
    
    if (imageTypes.includes(ext)) return 'image';
    if (videoTypes.includes(ext)) return 'video';
    return 'unknown';
}

// Upload file to Discord
async function uploadToDiscord(filePath, filename) {
    const FormData = require('form-data');
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const fileType = getFileType(filename);
    
    // Set appropriate content type
    const contentType = fileType === 'video' ? 'video/mp4' : 'image/jpeg';
    
    formData.append('files[0]', fileBuffer, {
        filename: filename,
        contentType: contentType
    });

    try {
        const response = await axios.post(
            `${DISCORD_CONFIG.apiUrl}/channels/${DISCORD_CONFIG.channelId}/messages`,
            formData,
            {
                headers: {
                    'Authorization': DISCORD_CONFIG.token,
                    ...formData.getHeaders()
                }
            }
        );

        if (response.data.attachments && response.data.attachments.length > 0) {
            return response.data.attachments[0].url;
        }
        throw new Error('No attachment URL returned');
    } catch (error) {
        console.error('Discord upload error:', error.response?.data || error.message);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/control-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control-panel.html'));
});

app.get('/api/gallery', (req, res) => {
    const data = loadGalleryData();
    res.json(data);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { title } = req.body;
        const originalPath = req.file.path;
        const fileType = getFileType(req.file.originalname);
        const processedFilename = `processed_${req.file.filename}`;
        const processedPath = path.join('processed', processedFilename);

        // Process the file based on type
        if (fileType === 'image') {
            await processImage(originalPath, processedPath);
        } else if (fileType === 'video') {
            await processVideo(originalPath, processedPath);
        } else {
            throw new Error('Unsupported file type');
        }

        // Upload to Discord
        console.log(`Uploading ${title} to Discord...`);
        const discordUrl = await uploadToDiscord(processedPath, processedFilename);

        // Save to gallery data
        const galleryData = loadGalleryData();
        const fileData = {
            id: Date.now().toString(),
            title: title || path.parse(req.file.originalname).name,
            filename: processedFilename,
            originalName: req.file.originalname,
            discordUrl: discordUrl,
            uploadDate: new Date().toISOString(),
            size: req.file.size,
            type: fileType
        };

        galleryData.files.unshift(fileData); // Add to beginning
        saveGalleryData(galleryData);

        // Clean up local files
        fs.unlinkSync(originalPath);
        fs.unlinkSync(processedPath);

        res.json({ 
            success: true, 
            message: `${fileType.charAt(0).toUpperCase() + fileType.slice(1)} uploaded successfully!`,
            fileData 
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            error: 'Upload failed', 
            details: error.message 
        });
    }
});

app.put('/api/gallery/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }
        
        const galleryData = loadGalleryData();
        const itemIndex = galleryData.files.findIndex(item => item.id === id);
        
        if (itemIndex === -1) {
            return res.status(404).json({ error: 'Media not found' });
        }
        
        // Update the item
        galleryData.files[itemIndex].title = title.trim();
        saveGalleryData(galleryData);
        
        console.log(`✏️ Updated: ${galleryData.files[itemIndex].title} (${galleryData.files[itemIndex].type})`);
        
        res.json({ 
            success: true, 
            message: 'Media updated successfully',
            updatedItem: galleryData.files[itemIndex]
        });
    } catch (error) {
        console.error('Edit error:', error);
        res.status(500).json({ 
            error: 'Update failed', 
            details: error.message 
        });
    }
});

app.delete('/api/gallery/:id', (req, res) => {
    try {
        const { id } = req.params;
        const galleryData = loadGalleryData();
        
        const itemIndex = galleryData.files.findIndex(item => item.id === id);
        if (itemIndex === -1) {
            return res.status(404).json({ error: 'Media not found' });
        }

        const deletedItem = galleryData.files[itemIndex];
        
        // Remove from gallery data
        galleryData.files.splice(itemIndex, 1);
        saveGalleryData(galleryData);

        console.log(`🗑️ Deleted: ${deletedItem.title} (${deletedItem.type})`);
        
        res.json({ 
            success: true, 
            message: `${deletedItem.type.charAt(0).toUpperCase() + deletedItem.type.slice(1)} deleted successfully`,
            deletedItem 
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            error: 'Delete failed', 
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Gallery server running on http://localhost:${PORT}`);
    console.log(`📊 Control panel: http://localhost:${PORT}/control-panel`);
    console.log(`✅ Discord configured for channel: ${DISCORD_CONFIG.channelId}`);
});