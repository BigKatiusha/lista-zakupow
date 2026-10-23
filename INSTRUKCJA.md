# Lista zakupów – uruchomienie krok po kroku

Potrzebujesz tylko przeglądarki na komputerze (Chrome albo Edge). Nic nie instalujesz.
Całość zajmuje ok. 15–20 minut. Wszystko jest darmowe.

Trzy części:

1. **Firebase** – baza danych, przez którą Wasze telefony się synchronizują.
2. **GitHub Pages** – darmowy adres w internecie, pod którym działa aplikacja.
3. **Telefony** – instalacja na ekranie głównym i połączenie drugiego telefonu.

---

## Część 1. Firebase (baza danych)

Konsola Firebase bywa po angielsku. Poniżej podaję angielskie nazwy przycisków. Jeśli masz ją po polsku, przyciski są w tych samych miejscach.

### 1.1. Nowy projekt

1. Wejdź na **https://console.firebase.google.com** i zaloguj się kontem Google.
2. Kliknij **Create a project** (albo **Get started by setting up a Firebase project**).
3. Nazwa projektu: `lista-zakupow`. Zaznacz zgodę na warunki i kliknij **Continue**.
4. Jeśli pojawi się pytanie o **Gemini / AI assistance**, możesz je wyłączyć (nie jest potrzebne). **Continue**.
5. **Google Analytics**: wyłącz przełącznik (nie jest potrzebny), potem **Create project**.
6. Poczekaj kilkanaście sekund i kliknij **Continue**.

> Projekt jest na darmowym planie **Spark** (widać to w lewym dolnym rogu).
> **Nie zmieniaj planu** i nie podawaj karty. Darmowe limity są wielokrotnie większe niż potrzeby dwóch osób.

### 1.2. Baza Firestore

1. W menu po lewej znajdź **Firestore Database**. Zwykle jest w grupie **Build** albo **Databases & Storage**. Jeśli menu jest zwinięte, kliknij ☰.
2. Kliknij **Create database**.
3. Jeśli konsola pyta o edycję (**Edition**), wybierz **Standard edition**. **Next**.
4. **Database ID** zostaw `(default)`. **Location** wybierz **us-central1 (Iowa)**, najbliżej Chicago. Lokalizacji nie da się później zmienić. **Next**.
5. Wybierz **Start in production mode**, potem **Create**.

### 1.3. Reguły bezpieczeństwa (ważne)

Reguły sprawiają, że do listy dostaje się tylko ktoś, kto zna jej długi kod. Innych list nie da się przeglądać.

1. W Firestore Database otwórz zakładkę **Rules** (u góry).
2. Zaznacz cały tekst w edytorze (Ctrl+A) i usuń go.
3. Otwórz plik **`firestore.rules`** z folderu aplikacji (np. w Notatniku), skopiuj całą zawartość i wklej ją do edytora.
4. Kliknij **Publish**.

### 1.4. Konfiguracja aplikacji

1. Kliknij **Project Overview** (ikona domku, lewy górny róg).
2. Kliknij **+ Add app** (albo dużą ikonę **`</>`** z podpisem **Web**).
3. **App nickname**: `Lista zakupów`.
   **Nie** zaznaczaj „Also set up Firebase Hosting”. Kliknij **Register app**.
4. Pokaże się kod z fragmentem podobnym do tego:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "lista-zakupow-xxxx.firebaseapp.com",
     projectId: "lista-zakupow-xxxx",
     storageBucket: "lista-zakupow-xxxx.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

5. Skopiuj ten fragment, od `{` do `}` włącznie. Potem kliknij **Continue to console**.
6. **Wklej go Claude’owi w czacie**, a wstawię go do pliku `config.js`.
   Możesz też zrobić to sam: otwórz `config.js` w Notatniku i w ostatniej linii zamień `null` na skopiowany fragment (od `{` do `}`). Na końcu zostaw średnik.

> Ta konfiguracja nie jest tajna, bo każda aplikacja webowa ją ujawnia. Listę chronią reguły z kroku 1.3 i długi kod listy.
> Konfigurację znajdziesz później w: ⚙️ **Project settings** → **General** → **Your apps** → **SDK setup and configuration** → **Config**.

---

## Część 2. GitHub Pages (adres aplikacji)

### 2.1. Konto i repozytorium

1. Załóż darmowe konto na **https://github.com/signup** (jeśli go nie masz) i potwierdź e-mail.
2. W prawym górnym rogu kliknij **+** → **New repository**.
3. **Repository name**: `lista-zakupow`. Zostaw **Public**. Niczego więcej nie zaznaczaj i kliknij **Create repository**.

### 2.2. Wgranie plików

1. Na stronie nowego repozytorium kliknij link **uploading an existing file**.
2. Otwórz folder `E:\Lista zakupow` w Eksploratorze Windows. Zaznacz wszystko (Ctrl+A) i przeciągnij do okna przeglądarki, foldery razem z plikami.
   Muszą się znaleźć: `index.html`, `sw.js`, `manifest.webmanifest`, `config.js` oraz foldery `css`, `js`, `icons`, `vendor`.
3. Poczekaj, aż pliki się wgrają, i kliknij zielony przycisk **Commit changes**.

### 2.3. Włączenie strony

1. W repozytorium wejdź w **Settings** (zakładka u góry), potem w menu po lewej **Pages**.
2. **Source**: wybierz **Deploy from a branch**. **Branch**: `main`, folder `/ (root)`. Kliknij **Save**.
3. Po 1–2 minutach odśwież stronę. U góry pojawi się **Your site is live at**
   `https://TWOJ-LOGIN.github.io/lista-zakupow/`. To jest adres aplikacji.

---

## Część 3. Telefony

### 3.1. Twój telefon (zakłada listę)

1. Otwórz adres aplikacji: na **iPhonie w Safari**, na **Androidzie w Chrome**.
2. Kliknij **Utwórz nową listę** i wpisz swoje imię.
3. Dodaj apkę do ekranu głównego:
   - **iPhone**: Udostępnij (kwadrat ze strzałką; w iOS 26 najpierw **•••** obok paska adresu) → **Do ekranu początkowego** → **Dodaj**.
   - **Android**: menu **⋮** → **Dodaj do ekranu głównego** (albo **Zainstaluj aplikację**) → **Zainstaluj**.
4. Od teraz otwieraj apkę ikoną **Zakupy**. Instrukcja jest też w samej apce (⚙️ → *Dodaj do ekranu głównego*).

### 3.2. Telefon żony i tablet

1. Na swoim telefonie otwórz ⚙️ → **Połącz telefon lub tablet**. Pokaże się kod QR.
2. Na drugim telefonie zeskanuj kod zwykłym aparatem i otwórz link (iPhone: w Safari).
3. Wybierz **Kim jesteś?** → wpisz imię → **Dalej**.
4. **Dopiero teraz** dodaj apkę do ekranu głównego (jak w 3.1, krok 3). Kod listy i imię zapamiętają się same.

> **Dlaczego „dopiero teraz” na iPhonie?** Apka z ekranu początkowego ma na iPhonie osobną pamięć niż Safari.
> Aplikacja przenosi kod listy w adresie strony, więc trzeba ją dodać po otwarciu linku.
> Gdyby mimo to apka pokazała ekran powitalny, dotknij **Mam kod lub link** i wklej link.
> Link skopiujesz na drugim telefonie: ⚙️ → Połącz telefon lub tablet → **Kopiuj link**.

---

## Przydatne informacje

- **Bez internetu**: apka działa normalnie, a zmiany wysyłają się same po odzyskaniu zasięgu.
  Na ekranie głównym widać stan: *Zsynchronizowano*, *Offline · 2 zmiany czekają*.
- **Kod listy** (⚙️ → Kod listy) daje dostęp do listy. Nie publikuj go. Wysyłaj go tylko domownikom.
- **Zakupy same się kończą** 12 godzin po ostatnim odhaczeniu. Dzieje się to przy najbliższym otwarciu apki na którymkolwiek telefonie.
- **Gesty na liście**:
  - dotknięcie albo przesunięcie w prawo: do koszyka;
  - przesunięcie w lewo: **Na stałe** / **Edytuj**; pełne przesunięcie w lewo zamienia jednorazową pozycję na stałą;
  - przytrzymanie: edycja.
  Kolejność ustawisz w menu **⋯** → *Edytuj listę i kolejność* (przeciągnij **≡**).
- **Szybkie dodawanie**: „2 Mleko” albo „Mleko x2” ustawia ilość.
  Wklejenie kilku linii dodaje kilka produktów naraz. Enter oznacza „+ Tylko raz”.

### Gdy coś nie działa

| Objaw | Co zrobić |
|---|---|
| Na ekranie głównym: *Tylko na tym urządzeniu (brak konfiguracji Firebase)* | `config.js` nadal ma `null`. Wstaw konfigurację z kroku 1.4 i wgraj plik ponownie na GitHub. Lista założona wcześniej wyśle się sama. |
| *Brak dostępu – sprawdź reguły Firestore* | Reguły z kroku 1.3 nie zostały opublikowane (**Publish**). |
| Drugi telefon: *Nie znaleziono listy o tym kodzie* | Sprawdź, czy link jest pełny. Najlepiej zeskanuj kod QR jeszcze raz. |
| Strona GitHub pokazuje 404 | Poczekaj 2 minuty po włączeniu Pages. Sprawdź, czy `index.html` leży w głównym folderze repozytorium, a nie w podfolderze. |

### Aktualizacje

Po zmianach w aplikacji wgraj zmienione pliki na GitHub tak samo jak w 2.2 (zastąpią stare).
Telefony pobiorą nową wersję przy następnym uruchomieniu. Apka pokaże komunikat *Jest nowa wersja · Odśwież*.

### Dla chętnych: dodatkowe zabezpieczenie klucza

W **https://console.cloud.google.com** wybierz projekt `lista-zakupow` → **APIs & Services** → **Credentials**.
Kliknij klucz **Browser key (auto created by Firebase)**. W **Application restrictions** wybierz **Websites** i dodaj `https://TWOJ-LOGIN.github.io/*`. Kliknij **Save**.
Od tej chwili klucz działa tylko z Waszej strony.
