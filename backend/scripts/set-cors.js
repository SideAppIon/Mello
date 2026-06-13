const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});
s3.send(new PutBucketCorsCommand({
  Bucket: 'mello-uploads',
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: ['https://sideappion.github.io', 'http://localhost:5173'],
      AllowedMethods: ['GET', 'PUT'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds: 3600,
    }],
  },
})).then(() => console.log('CORS set OK')).catch(e => { console.error('ERR', e.message); process.exit(1); });
