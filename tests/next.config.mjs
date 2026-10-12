import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig = {
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  serverExternalPackages: ['@seshuk/payload-plugin-tooling', 'mongodb-memory-server'],
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
