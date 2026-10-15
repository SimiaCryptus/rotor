# Encryption

Rotor can encrypt the **text** of individual notes with a password.
Encryption is per note, and the password is never stored. If you lose the password, the text is unrecoverable.

## What is and is not protected

| Protected | Not protected |
|---|---|
| The note's text (`content`) | Coordinates, so the grid still works |
| | Timestamps, note count, dimension names and values, view layout |
| | The fact that a note is encrypted, and the ciphertext length |

An encrypted note shows `🔒 *Encrypted note*` in the grid and is not searchable. The placeholder is what search sees.

## Cryptography

Implemented in `src/js/cipher.js` with the Web Crypto API (`crypto.subtle`). There are no dependencies.

| Parameter | Value |
|---|---|
| Cipher | AES-256-GCM (authenticated encryption) |
| Key derivation | PBKDF2 with HMAC-SHA-256, **250,000 iterations** |
| Salt | 16 random bytes |
| IV / nonce | 12 random bytes, fresh for every note |
| Encoding | base64 |

Stored envelope, in `item.enc`:

```json
{ "v": 1, "alg": "AES-GCM", "kdf": "PBKDF2-SHA256", "iter": 250000,
  "salt": "…", "iv": "…", "ct": "…" }
```

`ct` includes the GCM authentication tag. A wrong password fails authentication, so there is no garbage output. Because the stored `iter` is read back when decrypting, the iteration count can be raised in future without breaking old notes.

When several notes are encrypted at once, the key is derived **once** and shared by that batch (one salt). Each note still gets its own IV.

Encryption needs `crypto.subtle`, which browsers expose only in secure contexts (HTTPS, `localhost`, and in most browsers `file://`). Where it is unavailable, the encryption commands say so.

## Using it

### Encrypting

- **Side panel**: *🔒 Encrypt* on the selected note.
- **Header context menu**: *Encrypt N notes…* encrypts every note currently under that row or column header.
- **Dimension chip menu**: *Encrypt N notes with a <Dimension>…* encrypts all notes that have a value on that dimension.
- **Edit menu / palette**: `/encrypt [note|cell|view]` (the selected note, the focused cell, or everything in the current view).

Encryption always asks for the password **twice** and never reuses a remembered one. The dialog shows an entropy estimate: `bits ≈ length × log2(character pool)`, labelled very weak (<28 bits), weak, fair (≥36), strong (≥60) or very strong (≥80). This is a rough guide only. It cannot detect dictionary words or reused passwords.

Already-encrypted notes are skipped. The change is one undo step.

### Unlocking

- Double-click or `Enter` on a locked card, or *Unlock…* in the side panel.
- **Edit ▸ Unlock encrypted notes…** (`/unlock`).
- Rotor first tries every password remembered **this session**. If none works it asks, and a successful password immediately unlocks every other note that it opens.
- Decrypted text lives only in memory, as read-only display text. Locked and unlocked notes are visually distinct (🔓 marker).
- **Lock** (side panel) re-locks one note. `/lock` or **Edit ▸ Lock all encrypted notes** forgets all passwords and plaintext.

### Editing and decrypting

Encrypted notes are read-only, in the floating editor and the side panel alike.

- **Remove encryption to edit** (side panel, or `/decrypt`) stores an unlocked note's text unencrypted again. Re-encrypt when you are done.
- Header and dimension menus offer *Decrypt N notes…* to do this in bulk (one undo step, with confirmation). It tries remembered passwords, then asks once.

### The brute-force helper

The unlock dialog includes a **⚡ Brute force** button. It tries every alphanumeric string in order (`a`, `b`, … `aa`, `ab`, …) against the note.
It exists as a recovery aid for short passwords you forgot and to show how quickly weak passwords fall.
Each guess costs a full PBKDF2 derivation, so it is slow. It is hopeless for strong passwords. It does nothing for notes encrypted with long or non-alphanumeric passwords.

## Where plaintext can still exist

Encryption protects the *stored note*. It cannot erase copies made before you encrypted. Be aware of:

- **Undo history**: the undo stack in memory holds the pre-encryption document until you reload.
- **Snapshots** in `localStorage` (`rotor:snap:*`) taken before encrypting, for up to 30 days.
- **Previously saved files**: older exports, saved HTML copies, `.rotor` files and **Drive revision history**.
- **Browser storage** of older working copies, and browser or OS disk caches.
- **Memory**: while unlocked, plaintext and the password are in the page's memory.

For sensitive material, encrypt before the first save, and delete old snapshots and file versions.

## Interaction with other features

- **Agents**: encrypted notes are excluded from every agent scope and never sent anywhere.
- **Drive and files**: encrypted notes are saved as ciphertext. Passwords and plaintext never leave memory.
- **Export JSON / saved HTML**: contain only ciphertext for encrypted notes.
- **Search**: cannot see inside encrypted notes.
- **Moving and coordinates**: work as normal. Encrypted notes can be dragged, assigned, filtered and counted.

## Limitations

- No password recovery or reset exists.
- The ciphertext is not bound to a specific note (no associated data), so someone with write access to a file could swap two notes' ciphertexts. This does not reveal anything, but the swap would be accepted.
- Metadata is visible (see the first table).
- Strength depends entirely on your password. The 250,000 PBKDF2 iterations slow guessing down but do not rescue weak passwords.