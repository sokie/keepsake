# Full WhatsApp history via your Google Drive backup (Android)

WhatsApp's built-in *Export chat* (→ README, Option 1) is the recommended way
in — but it has caps (~40k messages / ~10k with media on many builds) and it
**silently drops emoji reactions**. For the complete archive, Keepsake can read
your phone's own backup database directly. You get every message since the
chat began, all reactions, and every media file that lives in the backup.

The dump is produced with the open-source
[wabdd](https://github.com/giacomoferretti/whatsapp-backup-downloader-decryptor),
which downloads the end-to-end-encrypted backup straight from Google Drive and
decrypts it with your 64-digit key. No cable, no adb, no root.

## 0. Prerequisite: e2e backup with a 64-digit key

Phone: **WhatsApp → Settings → Chats → Chat backup → End-to-end encrypted
backup → Turn on → Use 64-digit encryption key** (not a password — wabdd needs
the key). Store the key like a password. Then **Back up** to Google Drive.

## 1. Download + decrypt the backup

```bash
pipx install wabdd

# one-time Google token (follow the printed cookie instructions)
wabdd token YOUR@GMAIL.ADDRESS

# fetch everything: database + media (can be several GB)
wabdd download --token-file tokens/YOUR_GMAIL_token.txt

# decrypt with your 64-digit key
wabdd decrypt --key-file keys/PHONE_decryption.key dump backups/PHONE_DATE
```

You end up with two sibling folders:

```
backups/PHONE_DATE/             ← media files (unencrypted), Databases/*.crypt15
backups/PHONE_DATE-decrypted/   ← decrypted msgstore.db + the newest few media
```

## 2. Import into Keepsake

Open **Import → Complete archive**, paste **either** sibling's path — Keepsake
finds the database and searches *both* folders for media automatically — hit
Scan, pick the conversation, and if you already imported a phone export of the
same chat, choose it under **Add into** so everything merges into one timeline.
Duplicates are detected automatically; the database side wins where it's richer
(second-precision timestamps, reactions, edit flags, media).

Media is attached by **hardlink**: zero extra disk space, and the files survive
even if you later delete the dump.

## Good to know

- **Videos**: Google Drive backups only contain videos if *Include videos* was
  enabled in WhatsApp's backup settings. If it was off, video messages import
  fine but show a "not included" chip.
- **Contact names**: backups don't include your address book, so a fresh chat
  is named by phone number — rename it from the Archive page.
- **Refreshing**: repeat download → decrypt → import whenever you like; only
  new messages are added.
- **wtsexporter compatibility**: if you already have a
  [wtsexporter](https://github.com/KnugiHK/Whatsapp-Chat-Exporter) `result.json`,
  the same Import panel accepts it — but it's no longer needed, and note that
  wtsexporter 0.13.0 has a bug that drops each chat's first media message,
  which the native importer doesn't share.
