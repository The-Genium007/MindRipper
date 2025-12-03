#!/bin/bash

# Script pour vérifier et attendre que LibreTranslate soit prêt
# Compatible en local et dans Docker

echo "🔍 Vérification de LibreTranslate..."
echo ""

# Déterminer l'URL à utiliser
if [ -n "$LIBRE_TRANSLATE_URL" ]; then
    URL="$LIBRE_TRANSLATE_URL"
else
    URL="http://localhost:5000/translate"
fi

echo "URL: $URL"
echo ""

# Fonction pour tester LibreTranslate
test_translate() {
    curl -s -X POST "$URL" \
        -H "Content-Type: application/json" \
        -d '{"q":"Hello","source":"en","target":"fr","format":"text"}' \
        --max-time 5 2>/dev/null
}

# Attendre que LibreTranslate soit prêt (max 2 minutes)
MAX_ATTEMPTS=24
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "Tentative $ATTEMPT/$MAX_ATTEMPTS..."

    RESULT=$(test_translate)

    if echo "$RESULT" | grep -q "translatedText"; then
        echo ""
        echo "✅ LibreTranslate est prêt !"
        echo "Résultat du test: $RESULT"
        exit 0
    fi

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo ""
        echo "❌ LibreTranslate ne répond pas après 2 minutes"
        echo ""
        echo "Solutions possibles:"
        echo "1. Attendre encore quelques minutes (premier démarrage = téléchargement des modèles)"
        echo "2. Vérifier les logs: docker logs libretranslate"
        echo "3. Redémarrer: docker restart libretranslate"
        exit 1
    fi

    sleep 5
    ATTEMPT=$((ATTEMPT + 1))
done
