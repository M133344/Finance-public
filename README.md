# Oqim

A local-first personal finance app for iOS, built with Expo, React Native, and TypeScript. The web build provides a convenient development and test target.

## What works

- Separate device profiles, each with an independent transaction ledger.
- One text or voice entry box for income, expenses, money lent, and money borrowed.
- Suggested transaction type, currency, amount, and category using local English, Russian, Uzbek, and Arabic keyword rules. Unknown descriptions default to Other; all suggestions are editable before saving. This is a rules-based first version, not a remote AI service.
- A mandatory confirmation screen for both typed and dictated transactions.
- Separate UZS and USD balances, without an assumed exchange rate.
- Debt counterparties, required return dates, overdue states, and partial/full repayments. Lending subtracts cash; borrowing adds cash. Repayments update cash and outstanding principal together.
- History with description/person search, currency/type/category filters, and today/month/all-time/custom date ranges.
- Spending and cash-flow charts, period summaries, and general budgeting suggestions. Loans and repayments affect cash flow but are excluded from income/spending advice.
- English, Russian, Uzbek, and Arabic UI; Arabic reverses layout and aligns text right.
- Local persistence with visible write failures; unsaved transactions remain available for retry.

## Run locally

Use Node 22.13 or newer (validated here with Node 24.19) and npm.

```sh
npm ci
npm run web
```

For the current restricted cloud machine:

```sh
cd /workspace/Finance-
npm ci --cache /tmp/oqim-npm
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run web -- --host localhost --port 8081
```

The offline flag prevents Expo CLI metadata requests; it does not change speech-provider networking. Use the existing checkout: each cloud task is already isolated, so an additional Git worktree is unnecessary. Installation files persist in environment snapshots; development server processes must be restarted.

## iOS and dictation

On a Mac with Xcode, its command-line tools, an iOS simulator/device, and CocoaPods:

```sh
npm ci
npm run ios:build
```

This generates the native project and builds an Expo development client containing `expo-speech-recognition`. Subsequent starts can use `npm run ios`. The custom native module is not included in standard Expo Go. Microphone and speech-recognition usage descriptions are configured in `app.json`. Replace the example bundle identifier before distributing the app.

Speech uses the device speech provider on iOS and Web Speech Recognition in compatible browsers. Dictation writes only to the input field; users review the transcript and transaction details before saving. Permission denial, unsupported recognition, and no-speech responses leave typed entry available. Recognition availability, including Uzbek, depends on the OS/device/provider; unsupported languages can always be typed. Some speech providers send audio to their servers. No audio recording is retained by this app.

The iOS JavaScript/Hermes bundle was exported successfully in this Linux environment. **Native compilation, real microphone input, iOS permission prompts, and VoiceOver have not been validated on an Apple device.** Before release, test these with Xcode/on-device, review translations with native speakers, and complete app signing and App Store privacy information. No App Store build has been published.

## Validate

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

This cloud machine already provides Chromium, so use:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Playwright starts its own static server against `dist`; rebuild after source changes. Tests cover transactions, review-before-save, persistence, storage failure, profile separation, debt repayments, custom date filtering, Arabic persistence, and dictation using a mocked browser speech API, on desktop and phone-sized layouts. They do not simulate an iOS native build or validate real recognition quality.

To check the native JavaScript bundle without Xcode:

```sh
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npx expo export --platform ios --output-dir dist-ios
```

## Storage and scope

Device profiles are separate ledgers, not authenticated or password-protected accounts. AsyncStorage stores the versioned ledger locally (`oqim.ledger.v1`); on web this uses browser local storage. Cloud sync, encrypted vault storage, exports/backups, bank connections, automatic exchange-rate conversion, and push reminders are not implemented. Clearing app/browser data or uninstalling may erase the ledger. Transaction corrections are available before confirmation; editing/deleting saved records is not yet implemented. This first version should be evaluated with nonessential data until backup and recovery are added.

The finance logic is in `src/model.ts`, translations in `src/i18n.ts`, platform-specific dictation in `src/voice.ts` and `src/voice.native.ts`, and the interface in `App.tsx`. No service credentials are needed for local development.

## Import into Bolt.new

Connect your GitHub account in Bolt and import `M133344/Finance-` from the `main` branch. Keep it as an Expo / React Native application; use its web target for the browser preview.

In the Bolt terminal:

```sh
npm ci
npm run web -- --port 8081
```

Use the preview for port 8081. If Expo CLI metadata requests are blocked, use `EXPO_OFFLINE=1 npm run web -- --port 8081`. This project uses Expo SDK 57 and React Native 0.86; compatibility with Bolt's current runtime has not been independently verified. Do not automatically downgrade individual React/React Native/Expo dependencies; they need matching versions.

A useful initial prompt for Bolt:

> This is Oqim, an existing Expo React Native iOS app. Preserve the Expo architecture, device-local profiles, all four languages (English, Russian, Uzbek, Arabic with RTL), separate UZS/USD ledgers, transaction confirmation, and debt repayment accounting. Run the web target for preview. Keep the native speech module for iOS and the browser speech implementation for web. Run the typecheck and finance tests after changes.

Bolt's browser preview does not validate iOS native permissions or speech recognition. An installable iPhone app still needs a signed native build using Expo EAS or macOS/Xcode; see the iOS section above. GitHub remains the source repository, not a database for users' financial records.
