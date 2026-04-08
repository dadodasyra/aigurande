const fs = require('fs');

// 1. Définition des suffixes cibles
const highlightedParcelSuffixes = new Set([
    'C0516', 'C0519', 'C0517', 'C0533', 'C0713',
    'C0714', 'C0722', 'C0720', 'C0725', 'C0958',
    'C0959', 'C0960', 'C0961', 'C0727', 'C0732'
]);

const filePath = 'merged_crozon_aigurande.json';

try {
    // 2. Lecture du fichier
    console.log(`Lecture du fichier ${filePath}...`);
    const rawData = fs.readFileSync(filePath, 'utf8');
    const geojson = JSON.parse(rawData);

    let totalSurface = 0;
    let count = 0;

    // 3. Traitement des données
    geojson.features.forEach(feature => {
        const id = feature.properties.id;

        // On vérifie si l'ID finit par l'un des suffixes de la liste
        // On utilise .some() pour vérifier la correspondance
        const isMatch = Array.from(highlightedParcelSuffixes).some(suffix => id.endsWith(suffix));

        if (isMatch) {
            // Addition de la contenance (surface en m2)
            totalSurface += feature.properties.contenance || 0;
            count++;
        }
    });

    // 4. Affichage des résultats
    console.log('--- Résultats ---');
    console.log(`Nombre de parcelles trouvées : ${count}`);
    console.log(`Surface totale : ${totalSurface.toLocaleString()} m²`);
    console.log(`Surface totale (hectares) : ${(totalSurface / 10000).toFixed(4)} ha`);

} catch (error) {
    if (error.code === 'ENOENT') {
        console.error("Erreur : Le fichier 'merged_crozon_aigurande.json' est introuvable.");
    } else {
        console.error("Erreur lors du traitement :", error.message);
    }
}