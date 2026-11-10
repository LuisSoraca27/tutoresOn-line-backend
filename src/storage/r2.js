import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { HttpError } from "../middleware/errors.js";

let cached;
function storage() {
  if (cached) return cached;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new HttpError(503, "El almacenamiento de fotos no está configurado.");
  }
  cached = { bucket: R2_BUCKET_NAME, client: new S3Client({ region: "auto", endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" }) };
  return cached;
}

export async function subirFoto(key, body, contentType) {
  const { client, bucket } = storage();
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  } catch (error) {
    console.error("No se pudo guardar la foto en R2:", error.name, error.$metadata?.httpStatusCode);
    throw new HttpError(503, "No se pudo guardar la foto en el almacenamiento. Inténtalo más tarde.");
  }
}
export async function leerFoto(key) {
  const { client, bucket } = storage();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("El objeto de R2 no tiene contenido.");
  return { bytes: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType };
}
export async function borrarFoto(key) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
