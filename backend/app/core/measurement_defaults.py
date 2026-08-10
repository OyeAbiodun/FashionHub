import re

SYSTEM_MEASUREMENT_TEMPLATES = [
    (
        "Senator",
        "SENATOR",
        [
            "Shoulder",
            "Chest",
            "Stomach",
            "Sleeve Length",
            "Round Sleeve",
            "Top Length",
            "Trouser Waist",
            "Hip",
            "Thigh",
            "Knee",
            "Trouser Length",
            "Ankle",
        ],
    ),
    (
        "Agbada",
        "AGBADA",
        [
            "Shoulder",
            "Chest",
            "Sleeve Length",
            "Agbada Length",
            "Top Length",
            "Trouser Waist",
            "Hip",
            "Trouser Length",
            "Cap Size",
        ],
    ),
    (
        "Shirt",
        "SHIRT",
        ["Neck", "Shoulder", "Chest", "Stomach", "Sleeve Length", "Round Sleeve", "Shirt Length"],
    ),
    ("Trouser", "TROUSER", ["Waist", "Hip", "Thigh", "Knee", "Trouser Length", "Ankle", "Rise"]),
    (
        "Suit",
        "SUIT",
        [
            "Shoulder",
            "Chest",
            "Waist",
            "Jacket Length",
            "Sleeve Length",
            "Trouser Waist",
            "Hip",
            "Thigh",
            "Knee",
            "Trouser Length",
            "Ankle",
        ],
    ),
    (
        "Gown",
        "GOWN",
        [
            "Shoulder",
            "Bust",
            "Under Bust",
            "Waist",
            "Hip",
            "Sleeve Length",
            "Round Sleeve",
            "Gown Length",
        ],
    ),
    (
        "Blouse",
        "BLOUSE",
        [
            "Shoulder",
            "Bust",
            "Under Bust",
            "Waist",
            "Sleeve Length",
            "Round Sleeve",
            "Blouse Length",
        ],
    ),
    ("Skirt", "SKIRT", ["Waist", "Hip", "Skirt Length"]),
]


def normalize_field_key(field_name: str) -> str:
    value = field_name.strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_]", "", value)
    return re.sub(r"_+", "_", value).strip("_")
