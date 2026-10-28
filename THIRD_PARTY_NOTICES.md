# Third-party notices

## Original project

This is an independent fork of [HoverTranslate](https://github.com/kozii-d/hover-translate), Copyright © 2025 Dmytro Kozii, distributed under the [MIT license](LICENSE). The upstream README credits [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) and [XTranslate](https://github.com/ixrock/xt), as well as contributors to translation services. This fork retains those acknowledgements; the upstream authors are not responsible for fork changes or support.

## Direct runtime libraries

The direct runtime packages in `extension/package.json` and `popup/package.json` are distributed under their own licenses. As recorded in the installed package metadata at the checked-in lockfile versions, the following use the **MIT License**:

- [color-alpha](https://github.com/colorjs/color-alpha), [color-rgba](https://github.com/colorjs/color-rgba), [headers-polyfill](https://github.com/mswjs/headers-polyfill), [ky](https://github.com/sindresorhus/ky), [quick-lru](https://github.com/sindresorhus/quick-lru)
- [Emotion](https://github.com/emotion-js/emotion) (`@emotion/cache`, `@emotion/react`, `@emotion/styled`), [MUI](https://github.com/mui/material-ui) (`@mui/material`, `@mui/icons-material`)
- [Day.js](https://github.com/iamkun/dayjs), [i18next](https://github.com/i18next/i18next) and its browser language detector, HTTP backend and React integration, [qrcode](https://github.com/soldair/node-qrcode)
- [React and React DOM](https://github.com/facebook/react), [React Hook Form](https://github.com/react-hook-form/react-hook-form), [React Router](https://github.com/remix-run/react-router), [stylis-plugin-rtl](https://github.com/styled-components/stylis-plugin-rtl)

Build/test tools include [TypeScript](https://github.com/microsoft/TypeScript) and [Playwright](https://github.com/microsoft/playwright) (Apache-2.0), and Vite, Vitest, ESLint and other tools under their respective licenses. Exact dependency versions are in the three `package-lock.json` files. Production archives also include `THIRD_PARTY_LICENSES.txt`, generated from installed runtime dependencies and their transitive license texts. Two npm packages omit their license files from their published tarballs; their upstream MIT license texts are retained under `third_party_licenses/`. Review the notices and any additional assets/build dependencies before distributing a build. No claim is made that the MIT license of this repository replaces third-party terms.

Google Translate, Bing, DeepL, Cambridge, Reverso, Multitran, YouTube and Anki are independent third-party services/products, not bundled dictionaries or endorsements. Their own terms and privacy policies apply when used.
