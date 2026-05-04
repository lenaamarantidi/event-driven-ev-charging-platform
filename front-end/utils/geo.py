import numpy as np

def haversine_vectorized(lat1, lon1, lat2_array, lon2_array): 
    R = 6371  # Earth Radius (km)
    phi1, phi2 = np.radians(lat1), np.radians(lat2_array)
    dphi = np.radians(lat2_array - lat1)
    dlambda = np.radians(lon2_array - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return R * c