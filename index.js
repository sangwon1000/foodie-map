// Global variables
let restaurants = [];
let map;
let markers = {};

// Get DOM elements
const sidebar = document.getElementById('sidebar');
const restaurantList = document.getElementById('restaurant-list');
const selectedRestaurantInfo = document.getElementById('selected-restaurant');

// Get filter elements
const cityFilter = document.getElementById('country-filter');
const cuisineFilter = document.getElementById('cuisine-filter');
const priceFilter = document.getElementById('price-filter');
const searchInput = document.querySelector('.search-input');

// Add event listeners for filters
cityFilter.addEventListener('change', filterRestaurants);
cuisineFilter.addEventListener('change', filterRestaurants);
priceFilter.addEventListener('change', filterRestaurants);
searchInput.addEventListener('input', filterRestaurants);

// Fetch restaurants data
async function fetchRestaurants() {
    try {
        const response = await fetch('http://127.0.0.1:8000/api/hong-kong-restaurants');
        restaurants = await response.json();
        populateCuisineFilter();
        renderRestaurants(restaurants);
    } catch (error) {
        console.error('Error fetching restaurants:', error);
    }
}

// Populate cuisine filter options
function populateCuisineFilter() {
    const cuisines = [...new Set(restaurants.map(restaurant => restaurant.Cuisine))];
    cuisineFilter.innerHTML = '<option value="all">All</option>';
    cuisines.forEach(cuisine => {
        const option = document.createElement('option');
        option.value = cuisine;
        option.textContent = cuisine;
        cuisineFilter.appendChild(option);
    });
}

// Filter restaurants
function filterRestaurants() {
    const selectedCity = cityFilter.value;
    const selectedCuisine = cuisineFilter.value;
    const selectedPrice = priceFilter.value;
    const searchQuery = searchInput.value.toLowerCase();

    const filteredRestaurants = restaurants.filter(restaurant => {
        const matchesCity = restaurant.Address.includes(selectedCity);
        const matchesCuisine = selectedCuisine === 'all' || restaurant.Cuisine === selectedCuisine;
        const matchesPrice = selectedPrice === 'all' || restaurant.Price === selectedPrice;
        const matchesSearch = restaurant.Title.toLowerCase().includes(searchQuery) ||
            restaurant.Cuisine.toLowerCase().includes(searchQuery);

        return matchesCity && matchesCuisine && matchesPrice && matchesSearch;
    });

    renderRestaurants(filteredRestaurants);
}

// Initialize map and restaurants on page load
window.addEventListener('load', async () => {
    try {
        // Fetch MapTiler API key from backend
        const response = await fetch('http://127.0.0.1:8000/api/maptiler-key');
        const data = await response.json();
        maptilersdk.config.apiKey = data.apiKey;

        // Initialize map
        map = new maptilersdk.Map({
            container: 'map',
            style: maptilersdk.MapStyle.WINTER,
            center: [114.1694, 22.3193], // Hong Kong coordinates
            zoom: 11
        });

        // Fetch and render restaurants
        await fetchRestaurants();
    } catch (error) {
        console.error('Error initializing map:', error);
    }
});

// Function to render restaurants
function renderRestaurants(restaurantsToRender) {
    restaurantList.innerHTML = '';
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};

    restaurantsToRender.forEach(restaurant => {
        // Create restaurant card
        const card = document.createElement('div');
        card.className = 'restaurant-card';
        card.innerHTML = `
            <div class="restaurant-name">${restaurant.Title}</div>
            <div class="restaurant-info">
                ${restaurant.Cuisine} • ${restaurant.Price} • 
                <span class="michelin-star" title="Michelin Guide">✿</span>
            </div>
            <div class="rating-container">
                <div class="rating">${restaurant.Badge_Text || ''}</div>
                <div class="rating-stats">
                    <span class="star-rating">★ ${restaurant.rating || 'N/A'}</span>
                    <span class="rating-count">(${restaurant.user_ratings_count || 0})</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => selectRestaurant(restaurant));

        // Add event listener for the Michelin star
        const michelinStar = card.querySelector('.michelin-star');
        michelinStar.addEventListener('click', (e) => {
            e.stopPropagation();
            showMichelinGuideInfo();
        });

        restaurantList.appendChild(card);

        // Add marker to the map only if coordinates are available
        if (restaurant.longitude && restaurant.latitude) {
            const marker = new maptilersdk.Marker()
                .setLngLat([restaurant.longitude, restaurant.latitude])
                .addTo(map);

            marker.getElement().addEventListener('click', () => selectRestaurant(restaurant));

            markers[restaurant.Title] = marker;
        }
    });
}

// Function to handle restaurant selection
function selectRestaurant(restaurant) {
    if (restaurant.longitude && restaurant.latitude) {
        map.flyTo({
            center: [restaurant.longitude, restaurant.latitude],
            zoom: 15
        });
    }

    selectedRestaurantInfo.style.display = 'block';
    selectedRestaurantInfo.innerHTML = `
        <div class="close-button">&times;</div>
        <div class="restaurant-name">${restaurant.Title}</div>
        <div class="restaurant-info">${restaurant.Cuisine} • ${restaurant.Price}</div>
        <div class="rating">${restaurant.Badge_Text || ''}</div>
        <p>${restaurant.Description}</p>
        <span class="icon-button website-icon" onclick="window.open('${restaurant.Website || '#'}', '_blank')" title="Visit Website">🌐</span>
        <span>&nbsp</span>
        <span class="icon-button map-icon" onclick="window.open('${restaurant.Share_URL || '#'}', '_blank')" title="View on Google Maps">🗺️</span>
        <span>&nbsp</span>
        <span class="michelin-star" title="Michelin Guide">✿</span>
    `;

    // Add event listener for the close button
    const closeButton = selectedRestaurantInfo.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        selectedRestaurantInfo.style.display = 'none';
    });

    // Highlight the selected restaurant in the sidebar
    const restaurantCards = document.querySelectorAll('.restaurant-card');
    restaurantCards.forEach(card => {
        if (card.querySelector('.restaurant-name').textContent === restaurant.Title) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function showMichelinGuideInfo() {
    selectedRestaurantInfo.style.display = 'block';
    selectedRestaurantInfo.innerHTML = `
        <div class="close-button">&times;</div>
        <h2>Michelin Guide</h2>
        <p>The Michelin Guide is a series of guide books published by the French tire company Michelin for more than a century. The term normally refers to the annually published Michelin Red Guide, the oldest European hotel and restaurant reference guide, which awards up to three Michelin stars for excellence to a select few establishments.</p>
        <p>The acquisition or loss of a star can have dramatic effects on the success of a restaurant. Michelin also awards rising stars, an indication that a restaurant has the potential to qualify for a star, or an additional star.</p>
    `;

    // Add event listener for the close button
    const closeButton = selectedRestaurantInfo.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        selectedRestaurantInfo.style.display = 'none';
    });
}
