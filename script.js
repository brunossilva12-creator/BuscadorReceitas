
const MEAL_API_KEY = "1";
const GOOGLE_TRANSLATE_KEY = "COLOQUE_SUA_API_KEY_AQUI";

const MEAL_API = `https://www.themealdb.com/api/json/v1/${MEAL_API_KEY}`;

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const randomButton = document.getElementById("randomButton");
const recipesGrid = document.getElementById("recipesGrid");
const statusMessage = document.getElementById("statusMessage");
const resultsTitle = document.getElementById("resultsTitle");
const resultsCount = document.getElementById("resultsCount");
const recipeModal = document.getElementById("recipeModal");
const modalBody = document.getElementById("modalBody");
const closeModal = document.getElementById("closeModal");
const toast = document.getElementById("toast");

let currentRecipes = [];
let translationCache = new Map();

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function decodeHTML(value) {
    const element = document.createElement("textarea");
    element.innerHTML = value;
    return element.value;
}

async function translateTexts(texts, source, target) {
    const validTexts = texts.map(text => String(text ?? ""));

    if (GOOGLE_TRANSLATE_KEY === "COLOQUE_SUA_API_KEY_AQUI" || !GOOGLE_TRANSLATE_KEY.trim()) {
        throw new Error("Configure sua chave da API Google Cloud Translation no arquivo script.js.");
    }

    const results = [];
    const batchSize = 25;

    for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);

        const response = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_KEY)}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    q: batch,
                    source: source,
                    target: target,
                    format: "text"
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.error?.message || "Não foi possível realizar a tradução.";
            throw new Error(message);
        }

        const data = await response.json();

        const translations = data.data?.translations;

        if (!translations || translations.length !== batch.length) {
            throw new Error("A API de tradução retornou uma resposta inválida.");
        }

        translations.forEach(item => {
            results.push(decodeHTML(item.translatedText));
        });
    }

    return results;
}

async function translateText(text, source, target) {
    const value = String(text ?? "").trim();

    if (!value) return "";

    const cacheKey = `${source}:${target}:${value}`;

    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    const result = await translateTexts([value], source, target);

    translationCache.set(cacheKey, result[0]);

    return result[0];
}

async function fetchMeal(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Erro ao consultar o banco de receitas.");
    }

    return response.json();
}

function getIngredients(meal) {
    const ingredients = [];

    for (let i = 1; i <= 20; i++) {
        const ingredient = meal[`strIngredient${i}`];
        const measure = meal[`strMeasure${i}`];

        if (ingredient && ingredient.trim()) {
            ingredients.push({
                name: ingredient.trim(),
                measure: measure?.trim() || ""
            });
        }
    }

    return ingredients;
}

function showLoading(message) {
    recipesGrid.innerHTML = "";
    resultsCount.textContent = "";

    statusMessage.style.display = "flex";
    statusMessage.className = "status-message loading";

    statusMessage.innerHTML = `
        <div class="status-icon">🍳</div>
        <h3>${escapeHTML(message)}</h3>
        <p>Estamos procurando os melhores sabores para você. Aguarde um instante...</p>
    `;
}

function showError(message) {
    recipesGrid.innerHTML = "";
    resultsCount.textContent = "";

    statusMessage.style.display = "flex";
    statusMessage.className = "status-message";

    statusMessage.innerHTML = `
        <div class="status-icon">⚠️</div>
        <h3>Não foi possível concluir a pesquisa</h3>
        <p>${escapeHTML(message)}</p>
    `;
}

function hideStatus() {
    statusMessage.style.display = "none";
}

async function prepareCards(meals) {
    const limitedMeals = meals.slice(0, 12);

    const translated = await Promise.all(
        limitedMeals.map(async meal => {
            const values = [
                meal.strMeal || "",
                meal.strCategory || "",
                meal.strArea || ""
            ];

            const translatedValues = await translateTexts(values, "en", "pt");

            return {
                ...meal,
                translatedName: translatedValues[0],
                translatedCategory: translatedValues[1],
                translatedArea: translatedValues[2]
            };
        })
    );

    return translated;
}

function renderRecipes(meals) {
    currentRecipes = meals;

    hideStatus();

    resultsCount.textContent = `${meals.length} receita(s) encontrada(s)`;

    recipesGrid.innerHTML = meals.map((meal, index) => `
        <article class="recipe-card">
            <img
                class="recipe-image"
                src="${escapeHTML(meal.strMealThumb || "")}"
                alt="${escapeHTML(meal.translatedName)}"
                loading="lazy"
                onerror="this.style.background='#eee9df';this.removeAttribute('src')"
            >

            <div class="recipe-info">
                <span class="recipe-category">
                    ${escapeHTML(meal.translatedCategory || "Sem categoria")}
                </span>

                <h3>${escapeHTML(meal.translatedName || meal.strMeal)}</h3>

                <p class="recipe-origin">
                    🌍 Origem: ${escapeHTML(meal.translatedArea || "Não informada")}
                </p>

                <button
                    class="recipe-button"
                    data-index="${index}"
                >
                    Ver Receita →
                </button>
            </div>
        </article>
    `).join("");
}

async function searchRecipes(event) {
    if (event) event.preventDefault();

    const searchTerm = searchInput.value.trim();

    if (!searchTerm) {
        showToast("Digite o nome de um prato ou ingrediente.");
        return;
    }

    const searchType = document.querySelector(
        'input[name="searchType"]:checked'
    ).value;

    try {
        searchButton.disabled = true;
        randomButton.disabled = true;

        showLoading("Traduzindo sua pesquisa...");

        resultsTitle.textContent = "Resultados da pesquisa";

        const englishTerm = await translateText(
            searchTerm,
            "pt",
            "en"
        );

        showLoading("Buscando receitas...");

        let meals = [];

        if (searchType === "meal") {
            const data = await fetchMeal(
                `${MEAL_API}/search.php?s=${encodeURIComponent(englishTerm)}`
            );

            meals = data.meals || [];

        } else {
            const ingredient = englishTerm
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");

            const data = await fetchMeal(
                `${MEAL_API}/filter.php?i=${encodeURIComponent(ingredient)}`
            );

            const filteredMeals = data.meals || [];

            if (filteredMeals.length) {
                const selectedMeals = filteredMeals.slice(0, 12);

                const detailedMeals = await Promise.all(
                    selectedMeals.map(async meal => {
                        const details = await fetchMeal(
                            `${MEAL_API}/lookup.php?i=${encodeURIComponent(meal.idMeal)}`
                        );

                        return details.meals?.[0] || null;
                    })
                );

                meals = detailedMeals.filter(Boolean);
            }
        }

        if (!meals.length) {
            showError("Nenhuma receita encontrada. Experimente outro nome ou ingrediente.");
            return;
        }

        showLoading("Traduzindo os resultados...");

        const preparedMeals = await prepareCards(meals);

        renderRecipes(preparedMeals);

    } catch (error) {
        console.error(error);
        showError(error.message || "Verifique sua conexão e tente novamente.");
    } finally {
        searchButton.disabled = false;
        randomButton.disabled = false;
    }
}

async function randomRecipe() {
    try {
        searchButton.disabled = true;
        randomButton.disabled = true;

        showLoading("Escolhendo uma receita especial...");

        resultsTitle.textContent = "Receita surpresa";

        const data = await fetchMeal(`${MEAL_API}/random.php`);

        if (!data.meals?.length) {
            throw new Error("Não foi possível encontrar uma receita aleatória.");
        }

        const preparedMeals = await prepareCards(data.meals);

        renderRecipes(preparedMeals);

    } catch (error) {
        console.error(error);
        showError(error.message || "Erro ao buscar uma receita aleatória.");
    } finally {
        searchButton.disabled = false;
        randomButton.disabled = false;
    }
}

async function openRecipe(index) {
    const meal = currentRecipes[index];

    if (!meal) return;

    recipeModal.classList.add("active");
    document.body.style.overflow = "hidden";

    modalBody.innerHTML = `
        <div class="status-message loading">
            <div class="status-icon">🍳</div>
            <h3>Preparando sua receita...</h3>
            <p>Estamos traduzindo os ingredientes e o modo de preparo.</p>
        </div>
    `;

    try {
        let detailedMeal = meal;

        if (!meal.strInstructions) {
            const data = await fetchMeal(
                `${MEAL_API}/lookup.php?i=${encodeURIComponent(meal.idMeal)}`
            );

            detailedMeal = data.meals?.[0];

            if (!detailedMeal) {
                throw new Error("Detalhes da receita não encontrados.");
            }
        }

        const ingredients = getIngredients(detailedMeal);

        const originalTexts = [
            detailedMeal.strMeal || "",
            detailedMeal.strCategory || "",
            detailedMeal.strArea || "",
            detailedMeal.strInstructions || "",
            ...ingredients.flatMap(item => [
                item.name,
                item.measure
            ])
        ];

        const translatedTexts = await translateTexts(
            originalTexts,
            "en",
            "pt"
        );

        let position = 0;

        const name = translatedTexts[position++];
        const category = translatedTexts[position++];
        const area = translatedTexts[position++];
        const instructions = translatedTexts[position++];

        const translatedIngredients = ingredients.map(() => {
            const ingredient = translatedTexts[position++];
            const measure = translatedTexts[position++];

            return { ingredient, measure };
        });

        const ingredientsHTML = translatedIngredients.map(item => `
            <li>
                <span>${escapeHTML(item.measure || "A gosto")}</span>
                — ${escapeHTML(item.ingredient)}
            </li>
        `).join("");

        modalBody.innerHTML = `
            <img
                class="modal-image"
                src="${escapeHTML(detailedMeal.strMealThumb || "")}"
                alt="${escapeHTML(name)}"
            >

            <div class="modal-details">
                <span class="recipe-category">
                    ${escapeHTML(category || "Sem categoria")}
                </span>

                <h2>${escapeHTML(name)}</h2>

                <div class="modal-meta">
                    🌍 Origem: ${escapeHTML(area || "Não informada")}<br>
                    🍽️ Categoria: ${escapeHTML(category || "Não informada")}
                </div>

                <h3>🥕 Ingredientes e quantidades</h3>

                <ul class="ingredients-list">
                    ${ingredientsHTML || "<li>Ingredientes não informados.</li>"}
                </ul>

                <h3>👨‍🍳 Modo de preparo</h3>

                <p class="instructions">${escapeHTML(instructions || "Modo de preparo não informado.")}</p>

                <p class="translation-note">
                    Tradução automática de inglês para português brasileiro.
                </p>

                ${detailedMeal.strYoutube ? `
                    <a
                        href="${escapeHTML(detailedMeal.strYoutube)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="hero-button"
                    >
                        Assistir ao vídeo da receita →
                    </a>
                ` : ""}
            </div>
        `;

    } catch (error) {
        console.error(error);

        modalBody.innerHTML = `
            <div class="status-message">
                <div class="status-icon">⚠️</div>
                <h3>Erro ao carregar a receita</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
}

function closeRecipeModal() {
    recipeModal.classList.remove("active");
    document.body.style.overflow = "";
}

searchForm.addEventListener("submit", searchRecipes);

randomButton.addEventListener("click", randomRecipe);

recipesGrid.addEventListener("click", event => {
    const button = event.target.closest(".recipe-button");

    if (!button) return;

    openRecipe(Number(button.dataset.index));
});

closeModal.addEventListener("click", closeRecipeModal);

recipeModal.addEventListener("click", event => {
    if (event.target === recipeModal) {
        closeRecipeModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeRecipeModal();
    }
});
