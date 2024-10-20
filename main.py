from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv

# Load environment variables from a .env file
load_dotenv()

app = FastAPI()

# Get the API key from environment variables
MAPTILER_API_KEY = os.getenv("MAPTILER_API_KEY")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, change to specific origins if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# @app.get("/api/map")
# async def get_map_data():
#     if not MAPTILER_API_KEY:
#         raise HTTPException(status_code=500, detail="API key not found")

#     try:
#         async with httpx.AsyncClient() as client:
#             response = await client.get(
#                 "https://api.maptiler.com/maps",
#                 params={"key": MAPTILER_API_KEY}
#             )
#             response.raise_for_status()
#             return response.json()
#     except httpx.HTTPStatusError as exc:
#         raise HTTPException(status_code=exc.response.status_code, detail="Failed to fetch data")

@app.get("/api/maptiler-key")
async def get_maptiler_key():
    if not MAPTILER_API_KEY:
        raise HTTPException(status_code=500, detail="API key not found")
    return {"apiKey": MAPTILER_API_KEY}
