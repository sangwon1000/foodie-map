from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv
import pandas as pd
from fastapi.responses import JSONResponse
import math

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

@app.get("/api/hong-kong-restaurants")
async def get_hong_kong_restaurants():
    try:
        df = pd.read_csv('./hong_kong_restaurants_data_with_coordinates_updated.csv')
        
        # Convert DataFrame to a list of dictionaries
        records = df.to_dict(orient="records")
        
        # Function to handle non-JSON compliant float values
        def clean_float(value):
            if isinstance(value, float):
                if math.isnan(value) or math.isinf(value):
                    return None
            return value
        
        # Clean the records
        cleaned_records = [{k: clean_float(v) for k, v in record.items()} for record in records]
        
        return JSONResponse(content=cleaned_records)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="CSV file not found")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing data: {str(e)}")

