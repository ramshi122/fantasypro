const fs = require('fs');
const path = require('path');

async function test() {
  // Copy config to project root if not exists
  const configPath = path.join(process.cwd(), '.z-ai-config');
  if (!fs.existsSync(configPath)) {
    const etcConfig = fs.readFileSync('/etc/.z-ai-config', 'utf-8');
    fs.writeFileSync(configPath, etcConfig);
    console.log('Copied config to project root');
  }

  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();
  console.log('ZAI SDK initialized successfully!');

  // Test with screenshot
  const imagePath = '/home/z/my-project/upload/Screenshot_20260711_020837_Samsung Browser.jpg';
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  console.log('Image loaded, size:', imageBuffer.length, 'bytes');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all player names from this screenshot. Return as JSON array of strings.' },
          { type: 'image_url', image_url: { url: base64Image } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  });

  console.log('Vision API response:');
  console.log(response.choices[0]?.message?.content?.slice(0, 500));
}

test().catch(err => console.error('Error:', err.message));
