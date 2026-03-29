# 🔓 Hackipedia

> *Wikipedia était la porte d'entrée vers tout le savoir humain. On a décidé d'en refaire les serrures.*

---

Vous vous souvenez de cette situation ? Exposé de français, la veille pour le lendemain, sur un livre jamais ouvert.

Avant ChatGPT, on avait Wikipedia. Et c'était merveilleux — **60 millions d'articles, 300 langues, des milliers de contributeurs**. La plus grande encyclopédie jamais construite.

Et pourtant, on ne la recommande plus. Ces murs de texte, ça intimide. ChatGPT répond en 5 secondes, alors pourquoi s'embêter ?

Voilà le problème : ce n'est pas la même qualité d'information.

D'un côté — des faits **objectifs, sourcés, mis à jour en permanence.**
De l'autre — des réponses **biaisées, hallucinées, invérifiables.**

**Hackipedia, c'est notre réponse à ce faux dilemme.**

Ce n'est pas un nouveau site. Ce n'est pas un générateur de contenu.  
C'est Wikipedia — mais rendu accessible, moderne, et addictif.

---

## ✨ Ce que ça fait

- 🎧 **Lecture audio** — écoute un article Wikipedia pendant que tu fais autre chose
- 💬 **Q&A contextuel** — pose des questions sur l'article, obtiens des réponses ancrées dans la source
- 🧠 **Résumé intelligent** — l'essentiel de l'article, sans les 47 paragraphes d'introduction

*Toujours Wikipedia. Toujours fiable. Enfin agréable.*

---

## 🚀 Installation

```bash
git clone https://github.com/votre-repo/hackipedia-chrome
cd hackipedia-chrome
npm install
npm run build
```

Ensuite dans Chrome :

1. Ouvre `chrome://extensions/`
2. Active le **Developer mode** (haut droite)
3. Clique sur **"Load unpacked"**
4. Sélectionne le dossier `dist/`
5. Va dans les paramètres de l'extension
6. Entre ta clé **Mistral API** (champ 1) et **ElevenLabs** (champ 2)

Et c'est prêt. Va sur [Wikipedia](https://fr.wikipedia.org/) et laisse-toi entraîner par ta curiosité.

---

## 🔑 Prérequis

| Service | Utilisation | Lien |
|---|---|---|
| [Mistral AI](https://mistral.ai) | Q&A & résumés | [console.mistral.ai](https://console.mistral.ai) |
| [ElevenLabs](https://elevenlabs.io) | Lecture audio | [elevenlabs.io](https://elevenlabs.io) |

Les deux offrent un tier gratuit amplement suffisant pour commencer.

---

## 🧱 Stack

- **Extension Chrome** (Manifest V3)
- **Mistral AI** — LLM pour le Q&A contextuel et les résumés
- **ElevenLabs** — Text-to-Speech haute qualité

---

## 🤝 Contribuer

Le projet est libre et open source. Wikipedia a été construit par des milliers de contributeurs bénévoles. On aime cette philosophie.

Issues, PRs, idées — tout est bienvenu.

---

## 📜 Licence

MIT — fais-en ce que tu veux.

---

<p align="center">
  <em>Hackipedia — parce que le savoir fiable mérite une seconde chance.</em>
</p>
