# Install Demify

This guide is for everyone, also without developer experience. You download
Demify, run **one command**, and the installer does the rest: it checks
Docker, installs Ollama (the program that runs the language model) if it is
missing, picks the language model that suits your computer, downloads it,
starts Demify and opens it in your browser.

Research prototype, not a certified medical device. Demify is research and
training software for analog and simulated missions; see the
[intended purpose](../README.md#intended-purpose).

**Contents**

1. [What you need](#1-what-you-need)
2. [Download Demify](#2-download-demify)
3. [Run the installer](#3-run-the-installer)
4. [What the installer does](#4-what-the-installer-does)
5. [Open, stop, start again, update](#5-open-stop-start-again-update)
6. [Without a network connection](#6-without-a-network-connection)
7. [NVIDIA DGX Spark](#7-nvidia-dgx-spark)
8. [Troubleshooting](#8-troubleshooting)
9. [Installer options](#9-installer-options)

---

## 1. What you need

- A computer with Windows 10 or 11 (64-bit), macOS or Linux.
- At least 8 GB of memory; 16 GB is better.
- About **10 GB of free disk space** (about 25 GB if the installer picks the
  large model `gpt-oss:20b` for a computer with a strong graphics card).
- A **network connection for the first install**. After that Demify runs
  without one (section 6).
- Administrator rights (sudo on Linux) when Docker or Ollama still has to be installed.
- **Windows only:** [Git for Windows](https://git-scm.com/download/win)
  (it includes Git Bash), or Windows PowerShell, which every Windows has.

## 2. Download Demify

Either way works:

- **With Git** (recommended, makes updates easy): open a terminal (on
  Windows: Git Bash) and run

  ```bash
  git clone https://github.com/Duesi09/Demify---Health-Monitoring-Software-for-Astronauts.git
  cd Demify---Health-Monitoring-Software-for-Astronauts
  ```

- **Without Git:** on the GitHub page of the project choose **Code**, then
  **Download ZIP**, and unpack the ZIP file into a folder of your choice.

## 3. Run the installer

Open a terminal **in the Demify folder** (the folder that contains
`install.sh`) and type the one command for your system. Then follow the
questions: press Enter to answer yes.

### Windows with Git Bash

1. Open the Demify folder in Explorer.
2. Right-click an empty spot in the folder and choose **Open Git Bash here**
   (on Windows 11 first **Show more options**).
3. Type:

   ```bash
   bash install.sh
   ```

### Windows with PowerShell

1. Open the Demify folder in Explorer.
2. Click into the address bar, type `powershell` and press Enter. A
   PowerShell window opens in this folder.
3. Type:

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```

### macOS

1. Open **Terminal** (Applications, Utilities).
2. Type `cd ` (with a space), drag the Demify folder into the Terminal
   window and press Enter.
3. Type:

   ```bash
   bash install.sh
   ```

### Linux

1. Open a terminal in the Demify folder.
2. Type:

   ```bash
   bash install.sh
   ```

The first run takes 5 to 20 minutes, mostly for the downloads. When it is
done, your browser shows Demify.

> **If Docker was missing on Windows:** the installer installs Docker Desktop
> and then asks you to restart Windows. After the restart, start Docker
> Desktop once from the Start menu, accept its terms, and run the same
> command again. The installer continues where it stopped.

## 4. What the installer does

It prints every step and every command. It asks before it installs anything
and before every command that needs administrator rights (`sudo` on macOS and
Linux). It is safe to run again: steps that are already done are skipped.

1. **Docker.** Checks that Docker runs (with Compose v2). If it is missing:
   on Windows it offers to install Docker Desktop with `winget`; on macOS
   with Homebrew (or it opens the download page); on Linux it offers Docker's
   install script, with a warning, or shows the instructions for your
   distribution. If Docker Desktop is installed but not running, it starts it
   and waits up to 3 minutes.
2. **Ollama.** Checks that Ollama answers on `127.0.0.1:11434`. If it is
   missing, it installs it the official way (Windows: Ollama's installer;
   macOS: Homebrew, or the download page; Linux: Ollama's install script) and
   starts it.
3. **Language model.** Looks at the memory and the graphics card and picks a
   model, and prints why:

   | Your computer | Model | Download |
   |---|---|---|
   | NVIDIA DGX Spark, a computer with an NVIDIA graphics card with 16 GB or more, or a Mac with Apple silicon and 32 GB or more | `gpt-oss:20b` | about 14 GB |
   | 8.5 GB of memory or less | `gemma3:1b` | about 0.8 GB |
   | Anything else (for example a laptop with 16 GB) | `gemma3:4b` | about 3.3 GB |

   Details: [`LOCAL-MODEL.md` section 1](LOCAL-MODEL.md#1-which-model-on-which-device).
4. **Demify.** Downloads the model, writes two lines into the settings file
   `.env`, builds and starts Demify with Docker, waits until Demify reports
   the model and asks one test question.
5. **Browser.** Opens Demify at `http://localhost:3000` and prints how to
   stop it, update it and remove the model.

## 5. Open, stop, start again, update

All commands run in the Demify folder.

| To ... | Do this |
|---|---|
| Open Demify | Browser: <http://localhost:3000> (the onboard assistant: <http://localhost:3000/assistant>). If the installer chose another port, it printed the address |
| Stop Demify | `docker compose down` |
| Start it again | Start Docker Desktop and Ollama (they usually start with your computer), then `docker compose up -d`, or run the installer again |
| Update Demify | `git pull`, then run the installer again (same command as in section 3). With the ZIP download: download the new ZIP, unpack it, copy your `.env` file from the old folder into the new one, then run the installer in the new folder |
| Use another model | `bash install.sh --model gemma3:1b` (PowerShell: `-Model gemma3:1b`) |
| Remove the model | `ollama rm gemma3:4b` (the name the installer printed) |
| Remove Demify | `docker compose down -v` (this also deletes the data Demify stored, such as check-ins and readings), then delete the folder |

## 6. Without a network connection

After the first install everything Demify needs is on your computer: the
Demify container, the language model in Ollama, the onboard library and the
data snapshots. To use Demify without a network connection:

1. Start Docker Desktop and Ollama.
2. In the Demify folder: `docker compose up -d`.
3. Open <http://localhost:3000>.

Pages that show public NASA and NOAA data use the bundled copies then, marked
SNAPSHOT with their date. The onboard assistant works as before. Updates
(`git pull`, a new model) need the network again.

## 7. NVIDIA DGX Spark

The installer also runs on a DGX Spark: it recognises the GB10 chip, picks
`gpt-oss:20b` and starts the same single-container Demify as on a laptop. The
full onboard server (PostgreSQL with the onboard library, the model server
and the sync service in four containers) is set up differently; see
[`SPARK.md`](SPARK.md).

## 8. Troubleshooting

| What you see | What to do |
|---|---|
| `docker: command not found` or "Docker is not installed" | Run the installer again and answer yes to install Docker, or install [Docker Desktop](https://www.docker.com/products/docker-desktop/) yourself (Linux: [Docker Engine](https://docs.docker.com/engine/install/)). Windows: restart after the install |
| "Docker is not running" or "Cannot connect to the Docker daemon" | Start Docker Desktop and wait until it says the engine is running, then run the installer again. Linux: `sudo systemctl start docker` |
| Linux: "permission denied" on `docker.sock` | `sudo usermod -aG docker $USER`, log out and in again, run the installer again |
| "Port 3000 is used by another program" or "port is already allocated" | Answer yes when the installer offers the next free port. Or set another port in the file `.env` (for example `DEMIFY_PORT=3001`), run the installer again and open <http://localhost:3001> |
| Answers take very long, or "The language model did not answer in time" | Use the small model: `bash install.sh --model gemma3:1b` (PowerShell: `-Model gemma3:1b`). Or give it more time: add `DEMIFY_LLM_TIMEOUT_MS=180000` to `.env` and run `docker compose up -d` |
| Git Bash: `bash: !": event not found` | Git Bash treats `!` inside double quotes as a history command. Type the commands exactly as this guide shows them, or run `set +H` once first |
| The onboard assistant says the model is "not loaded" | Ollama does not have that model. Run the installer again with a network connection, or `ollama pull gemma3:4b`. `ollama list` shows the models on this computer; the name in `.env` must match one of them, including the part after the colon |
| The onboard assistant says "Model server offline" | Ollama is not running: start it (Windows: Start menu; macOS: Applications; Linux: `sudo systemctl start ollama`). Linux: see also [`LOCAL-MODEL.md`](LOCAL-MODEL.md#linux-ollama-must-listen-on-the-docker-bridge) |
| Linux: the installer stops with "Ollama listens on 127.0.0.1 only" | Follow the printed steps once (they let Ollama listen on the Docker network), then run the installer again |
| Windows: "running scripts is disabled on this system" | Start the installer exactly as in section 3: `powershell -ExecutionPolicy Bypass -File install.ps1` |
| Windows: Docker Desktop says WSL is missing or needs an update | In PowerShell as administrator: `wsl --install` (or `wsl --update`), restart the computer, run the installer again |
| Windows: "Demify needs Linux containers" | Right-click the Docker icon in the taskbar and choose **Switch to Linux containers** |
| The image build fails with `SELF_SIGNED_CERT_IN_CHAIN` | A company proxy checks the traffic; see [`DEPLOYMENT.md` section 4](DEPLOYMENT.md#4-behind-a-proxy--custom-ca) |

## 9. Installer options

| `install.sh` | `install.ps1` | Meaning |
|---|---|---|
| `--yes` | `-Yes` | Answer yes to every question (unattended) |
| `--model <name>` | `-Model <name>` | Use this model instead of the one for this computer |
| `--no-model` | `-NoModel` | Install Demify without a language model; the onboard assistant then shows the matching library passages only |
| `--show-model` | `-ShowModel` | Show the hardware and the model the installer would pick, then stop |
| `--dry-run` | `-DryRun` | Print every command instead of running it |
| `--no-browser` | `-NoBrowser` | Do not open the browser at the end |
| `--no-test` | `-NoTest` | Skip the test question |
| `--timeout <s>` | `-TimeoutSeconds <s>` | How long to wait for Demify to start (240) |

With Node.js installed, `npm run install:demify` runs `bash install.sh` (add
options after `--`, for example `npm run install:demify -- --yes`).
