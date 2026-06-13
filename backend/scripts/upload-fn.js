const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({ region: 'ru-central1', endpoint: 'https://storage.yandexcloud.net', forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
const body = fs.readFileSync(path.join(__dirname, '..', 'mello-function.zip'));
s3.send(new PutObjectCommand({ Bucket: 'mello-fn', Key: 'mello-function.zip', Body: body }))
  .then(() => console.log('uploaded', body.length, 'bytes')).catch(e => { console.error('ERR', e.message); process.exit(1); });
