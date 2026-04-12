# Pi-Sanity Agent Test List

Use these tests to verify the Pi-Sanity extension is working correctly. Run them in order and verify the expected behavior.

## 1. Home Directory Tests (Safety-First)

These tests verify protection of the user's home directory while minimizing risk.

### 1.1 Hidden File Read (Should ASK → currently DENY)
```bash
# Try to read a hidden config file
cat ~/.bashrc
```
**Expected**: Blocked with reason about hidden files in home directory

### 1.2 SSH Key Read (Should ALLOW)
```bash
# Try to read SSH public key (should be explicitly allowed)
cat ~/.ssh/id_rsa.pub 2>/dev/null || cat ~/.ssh/*.pub 2>/dev/null || echo "No SSH keys found"
```
**Expected**: Allowed (SSH public keys are safe)

### 1.3 Hidden File Write (Should ASK → currently DENY)
```bash
# Try to write to a hidden file in home
echo "test" > ~/.pi-sanity-test-hidden
```
**Expected**: Blocked with reason about writing to home directory

### 1.4 Regular File Write in Home (Should ASK → currently DENY)
```bash
# Try to write a regular file in home
echo "test" > ~/pi-sanity-test-regular.txt
```
**Expected**: Blocked with reason about writing to home directory

### 1.5 File Delete in Home (Should ASK → currently DENY)
```bash
# Create a test file first (might fail due to protection)
touch ~/pi-sanity-delete-test.txt 2>/dev/null || echo "Cannot create test file"
# Try to delete it
rm ~/pi-sanity-delete-test.txt 2>/dev/null || echo "Delete blocked"
```
**Expected**: Delete blocked with reason about home directory

### 1.6 Create Directory in Home (Should ASK → currently DENY)
```bash
mkdir ~/pi-sanity-test-dir 2>/dev/null || echo "Directory creation blocked"
```
**Expected**: Blocked with reason about writing to home directory

### 1.7 Nested Path in Hidden Directory (Should ASK → currently DENY)
```bash
# Try to write deep inside a hidden directory
echo "test" > ~/.local/share/pi-sanity-nested-test.txt
```
**Expected**: Blocked (verifies hidden directory traversal works)

---

## 2. Current Project Directory Tests (Should be FRICTIONLESS)

These tests verify normal development workflows aren't blocked.

### 2.1 Read Regular File (Should ALLOW)
```bash
# Read a normal project file
cat package.json
```
**Expected**: Allowed

### 2.2 Read Hidden File in Project (Should ALLOW)
```bash
# Read hidden files like .env (if exists) or .gitignore
cat .gitignore 2>/dev/null || cat .env.example 2>/dev/null || echo "No hidden files to read"
```
**Expected**: Allowed (CWD hidden files are OK for read)

### 2.3 Write Regular File (Should ALLOW)
```bash
# Create a new file
echo "Hello from Pi-Sanity test" > pi-sanity-test-file.txt
```
**Expected**: Allowed

### 2.4 Write Hidden File in Project (Should ALLOW)
```bash
# Create a hidden config file
echo "config=test" > .pi-sanity-test-config
```
**Expected**: Allowed (development often needs .env, .config files)

### 2.5 Edit Existing File (Should ALLOW)
```bash
# Append to the test file
echo "Additional line" >> pi-sanity-test-file.txt
```
**Expected**: Allowed

### 2.6 Create Subdirectory (Should ALLOW)
```bash
mkdir pi-sanity-test-subdir
echo "nested file" > pi-sanity-test-subdir/nested.txt
```
**Expected**: Allowed

### 2.7 Delete File in Project (Should ALLOW)
```bash
# Clean up test files
rm pi-sanity-test-file.txt
rm -rf pi-sanity-test-subdir
rm .pi-sanity-test-config 2>/dev/null || true
```
**Expected**: Allowed

### 2.8 Write to .git Directory (Should ASK → currently DENY)
```bash
# Try to modify git internals (dangerous)
echo "corrupt" > .git/config.backup
```
**Expected**: Blocked (git internals are protected even in CWD)

---

## 3. System Directory Tests (OS Will Block, Extension Should Also Block)

These tests verify the extension blocks system-level operations. Even if the extension fails, the OS requires root privileges for these.

### 3.1 Write to /etc (Should DENY)
```bash
echo "test" > /etc/pi-sanity-test 2>&1 || echo "Blocked (expected)"
```
**Expected**: Blocked by extension (OS would also block without sudo)

### 3.2 Write to System Root (Should DENY)
```bash
touch /pi-sanity-system-test 2>&1 || echo "Blocked (expected)"
```
**Expected**: Blocked by extension (OS would also block)

### 3.3 Write to /usr (Should DENY)
```bash
echo "test" > /usr/local/pi-sanity-test 2>&1 || echo "Blocked (expected)"
```
**Expected**: Blocked by extension (OS would also block)

### 3.4 Delete System File (Should DENY)
```bash
rm /etc/passwd 2>&1 || echo "Blocked (expected)"
```
**Expected**: Blocked by extension (OS would also block without sudo)

---

## 4. Bash Command Tests

### 4.1 Dangerous Command: dd (Should DENY)
```bash
dd if=/dev/zero of=/tmp/pi-sanity-dd-test bs=1M count=1
```
**Expected**: Blocked (dd is explicitly denied in default config)

### 4.2 Dangerous Command: rm -rf / (Should DENY)
```bash
rm -rf /
```
**Expected**: Blocked (write/delete to system directories)

### 4.3 Safe Command: ls (Should ALLOW)
```bash
ls -la
```
**Expected**: Allowed

### 4.4 Safe Command: echo with redirect to CWD (Should ALLOW)
```bash
echo "test output" > pi-sanity-echo-test.txt && rm pi-sanity-echo-test.txt
```
**Expected**: Allowed

### 4.5 Package Manager Global Install (Should DENY)
```bash
npm install -g typescript 2>&1 || echo "Global install blocked (expected)"
```
**Expected**: Blocked (global installs are denied by default)

### 4.6 Package Manager Local Install (Should ALLOW if in CWD)
```bash
# This would actually install, so let's just check the command parsing
# In practice, npm install in a project directory should work
```
**Expected**: Allowed (local installs are fine)

---

## 5. Parse Error Tests

### 5.1 Unclosed Quote (Should DENY)
```bash
echo "unclosed string
```
**Expected**: Blocked with "Invalid bash syntax" reason

### 5.2 Unclosed Backtick (Should DENY)
```bash
echo `date
```
**Expected**: Blocked with "Invalid bash syntax" reason

### 5.3 Incomplete If Statement (Should DENY)
```bash
if then
```
**Expected**: Blocked with "Invalid bash syntax" reason

---

## 6. Tilde Expansion Tests

### 6.1 Read with Tilde (Should work same as absolute path)
```bash
cat ~/.gitconfig 2>/dev/null || echo "File may not exist, but path should resolve"
```
**Expected**: Same result as `/home/user/.gitconfig` - blocked for hidden files

### 6.2 Write with Tilde (Should ASK → currently DENY)
```bash
echo "test" > ~/pi-sanity-tilde-test.txt
```
**Expected**: Blocked (tilde should expand to home directory)

---

## Cleanup Commands

After testing, clean up any files that might have been created:

```bash
# Clean up home directory test files (if any were created before extension loaded)
rm -f ~/pi-sanity-test-regular.txt ~/pi-sanity-delete-test.txt 2>/dev/null || true
rm -rf ~/pi-sanity-test-dir 2>/dev/null || true
rm -f ~/.pi-sanity-test-hidden 2>/dev/null || true
rm -f ~/.local/share/pi-sanity-nested-test.txt 2>/dev/null || true
rm -f /tmp/pi-sanity-* 2>/dev/null || true

# Clean up project directory test files
rm -f pi-sanity-test-file.txt pi-sanity-echo-test.txt 2>/dev/null || true
rm -rf pi-sanity-test-subdir 2>/dev/null || true
rm -f .pi-sanity-test-config .git/config.backup 2>/dev/null || true
```

---

## Verification Checklist

- [ ] Home hidden file read blocked
- [ ] SSH public key read allowed
- [ ] Home file write blocked
- [ ] Home file delete blocked
- [ ] Hidden directory traversal blocked (e.g., `~/.local/share/`)
- [ ] CWD file read allowed
- [ ] CWD file write allowed
- [ ] CWD hidden file write allowed
- [ ] CWD file delete allowed
- [ ] .git directory write blocked (even in CWD)
- [ ] System directory write blocked
- [ ] `dd` command blocked
- [ ] `npm install -g` blocked
- [ ] Parse errors blocked with clear message
- [ ] Tilde expansion works correctly
