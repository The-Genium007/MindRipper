# LibreTranslate - Configuration Guide

## 🌐 Qu'est-ce que LibreTranslate ?

LibreTranslate est un service de traduction **100% gratuit et open-source**. MindRipper l'utilise pour traduire automatiquement les articles de l'anglais vers le français.

## 🚀 Utilisation en Local

### Option 1 : Docker (RECOMMANDÉ)

```bash
# Démarrer LibreTranslate
docker run -d \
  --name libretranslate \
  -p 5000:5000 \
  -e LT_LOAD_ONLY=en,fr \
  --restart unless-stopped \
  libretranslate/libretranslate:latest

# Vérifier qu'il est prêt (peut prendre 2-3 minutes au premier démarrage)
npm run check:libretranslate
```

### Configuration dans .env

```env
LIBRE_TRANSLATE_URL=http://localhost:5000/translate
```

### Temps de démarrage

⚠️ **Important** : Au premier démarrage, LibreTranslate doit télécharger les modèles de langue (EN + FR). Cela peut prendre **2 à 5 minutes** selon votre connexion.

Symptômes pendant le téléchargement :
- Erreurs "socket hang up"
- Timeout des requêtes
- "Empty reply from server"

**Solution** : Attendre quelques minutes, puis relancer `npm run test:workflow`

### Vérifier l'état

```bash
# Vérifier les logs
docker logs libretranslate

# Tester manuellement
curl -X POST http://localhost:5000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"fr","format":"text"}'

# Utiliser le script de diagnostic
npm run check:libretranslate
```

## 🐳 Utilisation avec Docker Compose (Production)

Le fichier `docker-compose.yml` inclut déjà LibreTranslate configuré automatiquement.

### Configuration automatique

```yaml
services:
  libretranslate:
    image: libretranslate/libretranslate:latest
    environment:
      LT_LOAD_ONLY: en,fr  # Charge uniquement EN et FR pour économiser la RAM
    networks:
      - mindripper-net

  mindripper:
    environment:
      LIBRE_TRANSLATE_URL: http://libretranslate:5000/translate
    depends_on:
      - libretranslate
```

### Différences Local vs Docker

| Environnement | URL LibreTranslate |
|---------------|-------------------|
| **Local** | `http://localhost:5000/translate` |
| **Docker Compose** | `http://libretranslate:5000/translate` |

⚠️ **Important** :
- En local, on utilise `localhost`
- Dans Docker Compose, on utilise le nom du service `libretranslate` (résolution DNS interne)

## 🔧 Configuration dans .env

### Développement Local

```env
# .env (local)
TARGET_URL=https://www.example.com
SCRAPE_CRON=0 9 * * *
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=xxx
LIBRE_TRANSLATE_URL=http://localhost:5000/translate  # Local
PORT=3001
```

### Production (Dokploy / Docker Compose)

```env
# Variables d'environnement Dokploy
TARGET_URL=https://www.example.com
SCRAPE_CRON=0 9 * * *
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=xxx
# LIBRE_TRANSLATE_URL n'est PAS nécessaire - défini automatiquement dans docker-compose.yml
PORT=3001
```

Le `docker-compose.yml` configure automatiquement `LIBRE_TRANSLATE_URL=http://libretranslate:5000/translate`

## 📊 Ressources

- **RAM utilisée** : ~256-512 MB (avec EN+FR uniquement)
- **Premier démarrage** : 2-5 minutes (téléchargement des modèles)
- **Démarrages suivants** : 30-60 secondes
- **Limite de traduction** : Aucune (auto-hébergé)

## 🆘 Dépannage

### Problème : "socket hang up"

**Cause** : LibreTranslate n'est pas encore prêt

**Solution** :
```bash
# Attendre 2-3 minutes puis relancer
npm run check:libretranslate
```

### Problème : Le conteneur redémarre en boucle

**Cause** : Pas assez de RAM

**Solution** :
```bash
# Vérifier les ressources Docker
docker stats libretranslate

# Augmenter la RAM allouée à Docker (minimum 2GB recommandé)
```

### Problème : Traduction lente

**Cause** : Normal, la traduction CPU-intensive

**Solution** : C'est le comportement attendu. Une traduction de 60k caractères peut prendre 30-60 secondes.

## 🔄 Fallback automatique

Si LibreTranslate échoue, MindRipper garde automatiquement le texte original en anglais. L'entrée Notion sera créée avec :
- Titre EN = Titre FR (même texte)
- Contenu EN = Contenu FR (même texte)

Cela permet au workflow de ne jamais échouer complètement à cause de la traduction.

## 🌍 Alternative : Instance publique

Tu peux aussi utiliser l'instance publique (avec rate limits) :

```env
# .env
LIBRE_TRANSLATE_URL=https://libretranslate.com/translate
# Pas besoin de Docker dans ce cas
```

⚠️ **Limitations** :
- ~20 requêtes/minute
- Peut être lent aux heures de pointe
- Pas recommandé pour production
