import { ConfigType, registerAs } from '@nestjs/config'

import { env, envBoolean, envNumber } from '~/global/env'

export const minioRegToken = 'minio'

export const MinioConfig = registerAs(minioRegToken, () => ({
  endpoint: env('MINIO_ENDPOINT', '127.0.0.1'),
  port: envNumber('MINIO_PORT', 9000),
  accessKey: env('MINIO_ACCESS_KEY', 'minioadmin'),
  secretKey: env('MINIO_SECRET_KEY', 'minioadmin'),
  bucket: env('MINIO_BUCKET', 'wind-field'),
  /** 是否使用 HTTPS 连接 MinIO，内网 HTTP 部署保持 false */
  useSSL: envBoolean('MINIO_USE_SSL', false),
  /** path-style 访问（自建 MinIO 默认 true） */
  pathStyle: envBoolean('MINIO_PATH_STYLE', true),
}))

export type IMinioConfig = ConfigType<typeof MinioConfig>
