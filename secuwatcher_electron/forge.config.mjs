import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

export default {
  packagerConfig: {
    asar: true,
    name: 'SecuWatcher Export',
    productName: 'SecuWatcher Export',
    appBundleId: 'com.sphereax.secuwatcher-export',
    appVersion: '1.0.0',
    buildVersion: '1.0.0',
    icon: './src/assets/APP_LOGO.ico',
    extraResource: [
      './src/resources',
      './license.html'
    ],
    ignore: [
      /^\/src\//,
      /(.eslintrc|.gitignore|\.gitattributes)$/,
      /^\/\.(nyc_output|coverage)\//,
      /^\/test\//,
      'tsconfig.json'
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      authors: 'SphereAX',
      description: 'SecuWatcher Export Application',
      noMsi: true,
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main/index.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          }
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // NOTE: 개발 중에는 주석 처리 (start 명령 충돌 방지)
    // 패키징 시에만 활성화: npm run make
    /*
    {
      name: '@electron-forge/plugin-fuses',
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableCookieEncryption]: true,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      }
    }
    */
  ],
};
