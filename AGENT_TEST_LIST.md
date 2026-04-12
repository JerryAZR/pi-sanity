# Pi-Sanity Agent Test List

Use these tests to verify the Pi-Sanity extension is working correctly. The agent should use the specified tool (read/write/edit) to perform each action.

## 1. Home Directory Tests (Safety-First)

### 1.1 Read Hidden Config File
**Tool:** read  
**Action:** Read ~/.bashrc  
**Expected:** Blocked - hidden files in home require confirmation

### 1.2 Read SSH Public Key
**Tool:** read  
**Action:** Read ~/.ssh/id_rsa.pub (or any .pub file in ~/.ssh/)  
**Expected:** Allowed - SSH public keys are explicitly allowed

### 1.3 Write Hidden File in Home
**Tool:** write  
**Action:** Create ~/.pi-sanity-test with content "test"  
**Expected:** Blocked - writing to home directory requires confirmation

### 1.4 Write Regular File in Home
**Tool:** write  
**Action:** Create ~/pi-sanity-test.txt with content "test"  
**Expected:** Blocked - writing to home directory requires confirmation

### 1.5 Edit File in Home
**Tool:** edit  
**Action:** Edit ~/.bashrc to add a comment at the end  
**Expected:** Blocked - editing files in home requires confirmation

### 1.6 Create Nested File in Hidden Directory
**Tool:** write  
**Action:** Create ~/.local/share/pi-sanity-nested.txt with content "test"  
**Expected:** Blocked - paths inside hidden directories are protected

---

## 2. Current Project Directory Tests (Should be FRICTIONLESS)

### 2.1 Read Regular Project File
**Tool:** read  
**Action:** Read package.json in the current directory  
**Expected:** Allowed - reading project files should work

### 2.2 Read Hidden Project File
**Tool:** read  
**Action:** Read .gitignore  
**Expected:** Allowed - reading hidden files in project is fine

### 2.3 Create New File in Project
**Tool:** write  
**Action:** Create pi-sanity-test.txt with content "Hello from test"  
**Expected:** Allowed - writing in project directory should work

### 2.4 Create Hidden Config File
**Tool:** write  
**Action:** Create .pi-sanity-test-config with content "test=config"  
**Expected:** Allowed - hidden config files in project are OK

### 2.5 Edit Existing Project File
**Tool:** edit  
**Action:** Add a comment to the end of pi-sanity-test.txt  
**Expected:** Allowed - editing project files should work

### 2.6 Create File in Subdirectory
**Tool:** write  
**Action:** Create test-subdir/nested.txt with content "nested"  
**Expected:** Allowed - creating subdirectories and files should work

### 2.7 Modify Git Config
**Tool:** write or edit  
**Action:** Create or modify .git/config.backup  
**Expected:** Blocked - git internals are protected even in CWD

---

## 3. System Directory Tests

### 3.1 Read System File
**Tool:** read  
**Action:** Read /etc/hosts  
**Expected:** Allowed - reading system files is generally OK

### 3.2 Write to System Directory
**Tool:** write  
**Action:** Create /etc/pi-sanity-test with content "test"  
**Expected:** Blocked - system directories are protected

### 3.3 Write to Root
**Tool:** write  
**Action:** Create /pi-sanity-system-test with content "test"  
**Expected:** Blocked - root directory is protected

---

## 4. Bash Command Tests (via bash tool)

### 4.1 Safe Command
**Tool:** bash  
**Action:** Run "ls -la"  
**Expected:** Allowed - safe command

### 4.2 Dangerous dd Command
**Tool:** bash  
**Action:** Run "dd if=/dev/zero of=/tmp/pi-sanity-dd-test bs=1M count=1"  
**Expected:** Blocked - dd is explicitly denied

### 4.3 Global NPM Install
**Tool:** bash  
**Action:** Run "npm install -g typescript"  
**Expected:** Blocked - global package installs are denied

### 4.4 Remove Home Directory
**Tool:** bash  
**Action:** Run "rm -rf ~"  
**Expected:** Blocked - deleting home is dangerous

### 4.5 Parse Error
**Tool:** bash  
**Action:** Run a command with unclosed quote: echo "unclosed  
**Expected:** Blocked - invalid bash syntax

---

## Cleanup

After testing, clean up any created files:

**Using bash tool:**
```bash
rm -f ~/pi-sanity-test.txt ~/.pi-sanity-test 2>/dev/null; rm -rf ~/pi-sanity-test-dir 2>/dev/null; rm -f pi-sanity-test.txt .pi-sanity-test-config 2>/dev/null; rm -rf test-subdir 2>/dev/null; rm -f /tmp/pi-sanity-* 2>/dev/null; echo "Cleanup done"
```

---

## Quick Verification Summary

| Test | Tool | Expected |
|------|------|----------|
| Read ~/.bashrc | read | BLOCKED |
| Read ~/.ssh/id_rsa.pub | read | ALLOWED |
| Write to ~/test.txt | write | BLOCKED |
| Write to .git/config | write | BLOCKED |
| Read package.json | read | ALLOWED |
| Write test.txt in CWD | write | ALLOWED |
| Write .env in CWD | write | ALLOWED |
| Edit file in CWD | edit | ALLOWED |
| Write /etc/test | write | BLOCKED |
| Run dd | bash | BLOCKED |
| npm install -g | bash | BLOCKED |
| Invalid syntax | bash | BLOCKED |

---

## Notes

- The extension maps "ask" to "deny" for now, so all protected operations will be blocked
- Tilde (~) should expand correctly in all paths
- Hidden directories (.local, .config, etc.) should be properly protected
- The .git directory should be protected even within the project
