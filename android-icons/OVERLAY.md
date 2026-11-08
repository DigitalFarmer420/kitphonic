# Icon overlay for the code4 wrapper

Copy only `android-icons/res/` onto `android/app/src/main/res/`. Do not replace the code4 tree with the code3 archive. Do not change `versionCode` or `versionName`. Release Engineer allocates the next code.

Code4 wrapper verified here: 346031 bytes, SHA-256 `a47a486e784dbf1868c0cd7c9b66691815db93aaf3fb4bf998405f78defba3e0`, 66 files. Versus code3, only `android/app/build.gradle` changes, and only `versionCode` 3→4 and `versionName` `1.0.0-rc10.1`→`1.0.0-rc10-current-assets-test.1`. No `values-v31` directory is in that archive.

Preview PNGs are not in this tree. Do not copy mask previews, contact sheets, or QA images into `res/` or `www/`.

## What the launch theme actually shows

`AppTheme.NoActionBarLaunch` parents `Theme.SplashScreen` from `androidx.core:core-splashscreen:1.2.0` (the wrapper's `coreSplashScreenVersion`). The code4 style sets only `android:background` to `@drawable/splash`. That attribute is not `android:windowBackground` and not the API 31 splash icon.

From the 1.2.0 AAR, resource resolution is:

- Below API 31, `Theme.SplashScreen` sets `windowSplashScreenAnimatedIcon` to `@android:drawable/sym_def_app_icon` and `windowSplashScreenBackground` to `?android:colorBackground`. `android:windowBackground` is `@drawable/compat_splash_screen_no_icon_background`. From API 23 that drawable is a layer-list: the background color, then the animated icon at 288dp, then a circular mask. The visible hole is 192dp (mask 410dp minus two 109dp strokes). 192/288 = 2/3.
- On API 31 and above, the library's own `values-v31` replaces `Theme.SplashScreen`. It sets `android:windowSplashScreenAnimatedIcon` to `?windowSplashScreenAnimatedIcon` and `android:windowSplashScreenBackground` to `?windowSplashScreenBackground`. The app has no `values-v31`. The platform then draws that icon in the system splash circle. The same 2/3 ratio is the adaptive-icon safe circle (72dp inside 108dp).

`@drawable/splash` is still the full contained master, uncropped, for the existing `android:background` item. It is not the API 31 system splash icon. Replacing only those bitmaps leaves the system splash on the generic icon and the theme color.

This overlay keeps `android:background` and adds the two attributes the library actually reads:

- `windowSplashScreenBackground` → `@color/ic_launcher_background` (`#FFF8E6`, the master's cream)
- `windowSplashScreenAnimatedIcon` → `@drawable/splash_icon`

`drawable-nodpi/splash_icon.png` is the same safe-fit as the adaptive foreground: both yellow marks are inside the center 2/3 circle. No `values-v31` file is added. No system-bar padding is added. `styles.xml` is otherwise the code4 file.

`Theme.SplashScreen` (not `Theme.SplashScreen.IconBackground`) is unchanged, so the icon-background mask (240dp slot, about 158dp hole) is not used.

## Copy

Launcher and splash bitmaps, `values/ic_launcher_background.xml`, `drawable-nodpi/splash_icon.png`, and `values/styles.xml`.

Leave `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` as they are. They already use `@color/ic_launcher_background` and `@mipmap/ic_launcher_foreground`.

## Delete the stock drawings

- `res/drawable-v24/ic_launcher_foreground.xml` (robot vector)
- `res/drawable/ic_launcher_background.xml` (teal vector)

The adaptive XML points at the mipmap and the color, not those drawables.

## Do not change

Package `com.digitalfarmer.kitphonic.rc8test`, version fields, signing, `MainActivity`, Capacitor config, or anything else in `styles.xml` beyond the two splash items.

Web favicons are `icons/favicon-32.png`, `icons/favicon-48.png`, and `icons/apple-touch-180.png`, linked from `index.html`. There is no web manifest and no service worker. When staging `www/`, copy `icons/` as well. Do not stage preview files.

`python3 tools/build-app-icon.py` rebuilds every raster from `icons/symbol-1024.png` and exits if that file's SHA-256 is not `4a45274b45d588c5b697b72a7d16e4aeb36c05afdd72e9bfac64f393c8204871`. These images are resamples of that raster, not a new drawing and not a vector.
