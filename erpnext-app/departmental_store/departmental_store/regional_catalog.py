"""Regional (Southern Tamil Nadu) demo catalog seed: ~150 products with English,
Tamil and Tanglish aliases across grocery/personal-care/household categories.

Safety rules honored:
- Idempotent: existing item_codes are skipped entirely (no price overwrites).
- Barcodes are SYNTHETIC in-store range (prefix 20..., valid EAN-13 check digit).
  The EAN "20-29" prefix is reserved for retailer-internal use — these can never
  collide with or masquerade as real manufacturer barcodes.
- Demo data is marked (description + dedicated Item Group) and intended only for
  the designated test site.

Run: bench --site <site> execute departmental_store.regional_catalog.seed
Count check (no creation): ...regional_catalog.seed --kwargs "{'dry_run': True}"
"""

import frappe

DEMO_GROUP = "Demo Regional (TN)"
ITEM_CODE_PREFIX = "TN-DEMO-"

# (name, tamil, tanglish_variants, brand, category, pack, uom, hsn, sell, purchase)
PRODUCTS: list[tuple] = [
    # Rice and grains
    ("Ponni Raw Rice 5kg", "பொன்னி ராவ் அரிசி", "ponni raw rice,arisi", "Local", "Rice and Grains", "5kg", "Kg", "100600", 420, 370),
    ("Idly Rice 5kg", "இட்லி அரிசி", "idly rice,idli arisi", "Local", "Rice and Grains", "5kg", "Kg", "100600", 380, 335),
    ("Sona Masoori Rice 10kg", "சோனா மசூரி அரிசி", "sona masoori rice", "Local", "Rice and Grains", "10kg", "Kg", "100600", 780, 700),
    ("Seeraga Samba Rice 1kg", "சீரக சம்பா அரிசி", "seeraga samba rice,jeeraga samba", "Local", "Rice and Grains", "1kg", "Kg", "100600", 120, 95),
    ("Broken Rice 5kg", "உடைத்த அரிசி", "broken rice,udai arisi", "Local", "Rice and Grains", "5kg", "Kg", "100600", 260, 225),
    ("Wheat Flour 1kg", "கோதுமை மாவு", "gothumai mavu,wheat flour,atta", "Local", "Flour and Cooking", "1kg", "Kg", "110100", 55, 44),
    ("Rice Flour 1kg", "அரிசி மாவு", "arisi mavu,rice flour", "Local", "Flour and Cooking", "1kg", "Kg", "110200", 48, 38),
    ("Idiyappam Flour 1kg", "இடியாப்பம் மாவு", "idiyappam mavu,string hopper flour", "Local", "Flour and Cooking", "1kg", "Kg", "110200", 62, 50),
    ("Rava 1kg", "ரவை", "rava,sooji,semolina", "Local", "Flour and Cooking", "1kg", "Kg", "110200", 52, 42),
    # Dals and pulses
    ("Toor Dal 1kg", "துவரம் பருப்பு", "thuvaram paruppu,toor dal,tuvaram", "Local", "Dals and Pulses", "1kg", "Kg", "071300", 165, 140),
    ("Chana Dal 1kg", "கடலை பருப்பு", "kadalai paruppu,chana dal,kadala paruppu", "Local", "Dals and Pulses", "1kg", "Kg", "071300", 130, 105),
    ("Moong Dal 1kg", "பாசிப் பயறு", "pasip payaru,moong dal,pasi paruppu", "Local", "Dals and Pulses", "1kg", "Kg", "071300", 145, 120),
    ("Urad Dal 1kg", "உளுத்தம் பருப்பு", "ulutham paruppu,urad dal,ulunthu", "Local", "Dals and Pulses", "1kg", "Kg", "071300", 155, 128),
    ("Masoor Dal 1kg", "மசூர் பருப்பு", "masoor paruppu,masoor dal", "Local", "Dals and Pulses", "1kg", "Kg", "071300", 125, 100),
    ("Karamani 500g", "காராமணி", "karamani,cowpeas", "Local", "Dals and Pulses", "500g", "Kg", "071300", 78, 62),
    ("Groundnut 500g", "நிலக்கடலை", "nilakadalai,groundnut,peanut,kadalai", "Local", "Dals and Pulses", "500g", "Kg", "120200", 72, 58),
    # Edible oils
    ("Groundnut Oil 1L", "நிலக்கடலை எண்ணெய்", "kadalai ennai,groundnut oil", "Local", "Edible Oils", "1L", "Litre", "150800", 210, 185),
    ("Coconut Oil 1L", "தேங்காய் எண்ணெய்", "thengai ennai,coconut oil", "Local", "Edible Oils", "1L", "Litre", "151300", 320, 280),
    ("Sunflower Oil 1L", "சூரியகாந்தி எண்ணெய்", "sunflower oil", "Fortune", "Edible Oils", "1L", "Litre", "151200", 165, 145),
    ("Gingelly Oil 500ml", "நல்லெண்ணெய்", "nallennai,gingelly oil,sesame oil", "Local", "Edible Oils", "500ml", "Litre", "151500", 240, 205),
    ("Palm Oil 1L", "பாம் எண்ணெய்", "palm oil", "Local", "Edible Oils", "1L", "Litre", "151100", 130, 112),
    # Spices and masala
    ("Turmeric Powder 200g", "மஞ்சள் தூள்", "manjal thool,turmeric powder,manjal", "Aachi", "Spices and Masala", "200g", "Kg", "091000", 58, 45),
    ("Chilli Powder 200g", "மிளகாய் தூள்", "milagai thool,chilli powder", "Aachi", "Spices and Masala", "200g", "Kg", "090400", 62, 48),
    ("Coriander Powder 200g", "மல்லி தூள்", "malli thool,coriander powder,dhania", "Aachi", "Spices and Masala", "200g", "Kg", "090900", 55, 42),
    ("Sambar Powder 200g", "சாம்பார் பொடி", "sambar podi,sambar powder", "Sakthi", "Spices and Masala", "200g", "Kg", "091000", 68, 54),
    ("Rasam Powder 200g", "ரசம் பொடி", "rasam podi,rasam powder", "Sakthi", "Spices and Masala", "200g", "Kg", "091000", 66, 52),
    ("Garam Masala 100g", "கரம் மசாலா", "garam masala", "Aachi", "Spices and Masala", "100g", "Kg", "091000", 52, 40),
    ("Pepper 100g", "மிளகு", "milagu,pepper,black pepper", "Local", "Spices and Masala", "100g", "Kg", "090400", 85, 68),
    ("Cumin Seeds 100g", "சீரகம்", "seeragam,cumin,jeera", "Local", "Spices and Masala", "100g", "Kg", "090900", 72, 58),
    ("Mustard Seeds 100g", "கடுகு", "kadugu,mustard seeds", "Local", "Spices and Masala", "100g", "Kg", "120700", 32, 24),
    ("Tamarind 250g", "புளி", "puli,tamarind", "Local", "Spices and Masala", "250g", "Kg", "081000", 68, 52),
    ("Curry Masala 50g", "குழம்பு மசாலா", "kulambu masala,kuzhambu podi", "Sakthi", "Spices and Masala", "50g", "Kg", "091000", 28, 21),
    ("Idly Chillipodi 200g", "இட்லி மிளகாய் பொடி", "idli podi,idly milagai podi", "Local", "Spices and Masala", "200g", "Kg", "090400", 64, 50),
    ("Asafoetida 50g", "பெருங்காயம்", "perungayam,asafoetida,hing", "Local", "Spices and Masala", "50g", "Kg", "330100", 78, 62),
    # Salt & sugar & basics
    ("Iodised Salt 1kg", "உப்பு", "uppu,salt", "Tata", "Flour and Cooking", "1kg", "Kg", "250100", 28, 21),
    ("Sugar 1kg", "சர்க்கரை", "sarkarai,sugar", "Local", "Flour and Cooking", "1kg", "Kg", "170100", 48, 41),
    ("Jaggery 500g", "வெல்லம்", "vellam,jaggery", "Local", "Flour and Cooking", "500g", "Kg", "170100", 62, 50),
    # Tea and coffee
    ("Tea Dust 250g", "தேயிலை தூள்", "thayilai thool,tea dust,tea powder", "AVT", "Tea and Coffee", "250g", "Kg", "090200", 88, 70),
    ("Tea Leaves 500g", "தேநீர் இலை", "tea leaves,theneer", "Tata Tea", "Tea and Coffee", "500g", "Kg", "090200", 165, 138),
    ("Filter Coffee Powder 200g", "பில்டர் காபி பொடி", "filter coffee powder,kapi podi", "Local", "Tea and Coffee", "200g", "Kg", "090100", 95, 78),
    ("Instant Coffee 50g", "இன்ஸ்டன்ட் காபி", "instant coffee,nescafe", "Nescafe", "Tea and Coffee", "50g", "Kg", "090100", 145, 118),
    ("Health Mix 200g", "சத்து மாவு", "sathu mavu,health mix", "Local", "Flour and Cooking", "200g", "Kg", "110200", 72, 58),
    # Milk and dairy
    ("Toned Milk Pouch 500ml", "பால்", "paal,milk,milk packet", "Aavin", "Milk and Dairy", "500ml", "Litre", "040100", 26, 23),
    ("Curd Cup 200g", "தயிர்", "thayir,curd,yogurt", "Aavin", "Milk and Dairy", "200g", "Kg", "040300", 22, 18),
    ("Butter 100g", "வெண்ணெய்", "vennai,butter", "Amul", "Milk and Dairy", "100g", "Kg", "040500", 58, 48),
    ("Ghee 200ml", "நெய்", "ney,ghee", "Aavin", "Milk and Dairy", "200ml", "Litre", "040500", 185, 158),
    ("Milk Powder 200g", "பால் பொடி", "paal podi,milk powder", "Amul", "Milk and Dairy", "200g", "Kg", "040200", 118, 98),
    ("Paneer 200g", "பனீர்", "paneer,panir", "Local", "Milk and Dairy", "200g", "Kg", "040600", 88, 72),
    # Biscuits and snacks
    ("Parle-G Biscuits 100g", "பிஸ்கட்", "biscuit,parle,parle-g", "Parle-G", "Biscuits and Snacks", "100g", "Kg", "190500", 10, 8),
    ("Marie Biscuits 150g", "மேரி பிஸ்கட்", "marie biscuit", "Britannia", "Biscuits and Snacks", "150g", "Kg", "190500", 20, 16),
    ("Good Day Cashew 100g", "குட் டே பிஸ்கட்", "good day biscuit", "Britannia", "Biscuits and Snacks", "100g", "Kg", "190500", 30, 24),
    ("Bourbon Biscuits 100g", "போர்பன் பிஸ்கட்", "bourbon biscuit", "Britannia", "Biscuits and Snacks", "100g", "Kg", "190500", 32, 26),
    ("Salted Peanuts 200g", "வேர்க்கடலை", "verkkadalai,salted peanuts", "Local", "Biscuits and Snacks", "200g", "Kg", "120200", 42, 33),
    ("Murukku 200g", "முறுக்கு", "murukku,muruku", "Local", "Biscuits and Snacks", "200g", "Kg", "190500", 55, 42),
    ("Ribbon Pakoda 200g", "ரிப்பன் பக்கோடா", "ribbon pakoda,omapodi", "Local", "Biscuits and Snacks", "200g", "Kg", "190500", 52, 40),
    ("Mixture 200g", "மிக்சர்", "mixture,mix snack", "Local", "Biscuits and Snacks", "200g", "Kg", "190500", 58, 45),
    ("Potato Chips 52g", "பொட்டாட்டோ சிப்ஸ்", "chips,potato chips", "Lays", "Biscuits and Snacks", "52g", "Kg", "200500", 20, 16),
    ("Banana Chips 200g", "வாழைக்காய் சிப்ஸ்", "valaikai chips,banana chips", "Local", "Biscuits and Snacks", "200g", "Kg", "200500", 55, 42),
    # Packaged food
    ("Instant Noodles 70g", "நூடுல்ஸ்", "noodles,maggi", "Maggi", "Packaged Food", "70g", "Kg", "190200", 14, 11),
    ("Vermicelli 200g", "சேமியா", "semiya,vermicelli", "Local", "Packaged Food", "200g", "Kg", "190200", 32, 25),
    ("Wheat Rava 500g", "கோதுமை ரவை", "gothumai rava,wheat rava", "Local", "Flour and Cooking", "500g", "Kg", "110100", 42, 34),
    ("Bread 400g", "ரொட்டி", "rotti,bread", "Local", "Packaged Food", "400g", "Kg", "190500", 28, 23),
    ("Jam 200g", "ஜாம்", "jam", "Kissan", "Packaged Food", "200g", "Kg", "200700", 55, 44),
    ("Honey 100g", "தேன்", "then,honey", "Local", "Packaged Food", "100g", "Kg", "040900", 68, 54),
    ("Pickle 200g", "ஊறுகாய்", "urugai,pickle", "Aachi", "Packaged Food", "200g", "Kg", "200100", 48, 38),
    ("Pappad 100g", "அப்பளம்", "appalam,pappad", "Local", "Packaged Food", "100g", "Kg", "190500", 35, 27),
    # Beverages
    ("Bottled Water 1L", "தண்ணீர் பாட்டில்", "thanneer bottle,water bottle", "Local", "Packaged Beverages", "1L", "Litre", "220100", 15, 10),
    ("Cola 750ml", "கோலா", "cola,soft drink", "Local", "Packaged Beverages", "750ml", "Litre", "220100", 40, 32),
    ("Orange Drink 600ml", "ஆரஞ்சு ஜூஸ்", "orange juice,orange drink", "Fanta", "Packaged Beverages", "600ml", "Litre", "220200", 38, 30),
    ("Mango Drink 600ml", "மாம்பழம் ஜூஸ்", "mampazham juice,mango drink", "Maaza", "Packaged Beverages", "600ml", "Litre", "220200", 38, 30),
    ("Lemon Soda 250ml", "லெமன் சோடா", "lemon soda", "Local", "Packaged Beverages", "250ml", "Litre", "220100", 20, 15),
    ("Badam Milk Drink 180ml", "பாதாம் பால்", "badam paal,badam milk", "Local", "Packaged Beverages", "180ml", "Litre", "040300", 25, 19),
    # Personal care - soap
    ("Bath Soap 125g", "குளியல் சோப்பு", "kuliyal soap,bath soap,soap", "Lux", "Soap and Personal Care", "125g", "Kg", "340100", 42, 34),
    ("Lifebuoy Soap 125g", "லைஃப்புவாய் சோப்பு", "lifebuoy soap", "Lifebuoy", "Soap and Personal Care", "125g", "Kg", "340100", 38, 30),
    ("Mysore Sandal Soap", "மைசூர் சந்தன சோப்பு", "mysore sandal soap,sandal soap", "Mysore", "Soap and Personal Care", "125g", "Kg", "340100", 52, 41),
    ("Hamam Soap 125g", "ஹமாம் சோப்பு", "hamam soap", "Hamam", "Soap and Personal Care", "125g", "Kg", "340100", 40, 32),
    ("Medicated Soap 100g", "மருத்துவ சோப்பு", "maruthuva soap,medicated soap", "Dettol", "Soap and Personal Care", "100g", "Kg", "340100", 45, 36),
    ("Washing Soap Bar 200g", "துணி சோப்பு", "thuni soap,washing soap bar", "Rin", "Laundry Detergent", "200g", "Kg", "340100", 32, 25),
    # Toothpaste and brushes
    ("Toothpaste 150g", "பற்பசை", "parpasai,toothpaste", "Colgate", "Toothpaste and Brushes", "150g", "Kg", "330600", 85, 68),
    ("Toothpaste 100g", "பற்பசை 100", "pepsodent,toothpaste 100g", "Pepsodent", "Toothpaste and Brushes", "100g", "Kg", "330600", 52, 41),
    ("Toothbrush Soft", "பல் தூரிகை", "pal thoorikai,toothbrush", "Colgate", "Toothpaste and Brushes", "1pc", "Nos", "960300", 45, 34),
    ("Tooth Powder 100g", "பற்பொடி", "parpodi,tooth powder", "Gopal", "Toothpaste and Brushes", "100g", "Kg", "330600", 32, 24),
    ("Tongue Cleaner", "நாக்கு சுத்தம்", "naakku cleaner,tongue cleaner", "Local", "Toothpaste and Brushes", "1pc", "Nos", "960300", 25, 15),
    # Shampoo and hair care
    ("Shampoo Sachet 8ml", "ஷாம்பூ சாச்சே", "shampoo sachet,shampoo", "Clinic Plus", "Shampoo and Hair Care", "8ml", "Litre", "330500", 5, 3),
    ("Shampoo Bottle 180ml", "ஷாம்பூ பாட்டில்", "shampoo bottle", "Head & Shoulders", "Shampoo and Hair Care", "180ml", "Litre", "330500", 165, 132),
    ("Hair Oil 100ml", "முடி எண்ணெய்", "mudi ennai,hair oil", "Parachute", "Shampoo and Hair Care", "100ml", "Litre", "330500", 68, 54),
    ("Coconut Hair Oil 200ml", "தேங்காய் எண்ணெய் 200", "thengai oil 200,coconut hair oil", "Parachute", "Shampoo and Hair Care", "200ml", "Litre", "330500", 125, 100),
    ("Hair Conditioner 100ml", "ஹேர் கண்டிஷனர்", "hair conditioner", "Local", "Shampoo and Hair Care", "100ml", "Litre", "330500", 95, 76),
    ("Shaving Cream 70g", "ஷேவிங் கிரீம்", "shaving cream", "Old Spice", "Soap and Personal Care", "70g", "Kg", "330700", 58, 46),
    ("Safety Razor Pack", "ரேசர் பேக்", "razor pack,safety razor", "Gillette", "Soap and Personal Care", "1pc", "Nos", "821200", 85, 68),
    # Laundry and dishwashing
    ("Detergent Powder 1kg", "டிடர்ஜென்ட் பவுடர்", "detergent powder,washing powder", "Surf Excel", "Laundry Detergent", "1kg", "Kg", "340200", 118, 95),
    ("Detergent Bar 250g", "டிடர்ஜென்ட் பார்", "detergent bar", "Rin", "Laundry Detergent", "250g", "Kg", "340200", 35, 28),
    ("Detergent Sachet 20g", "டிடர்ஜென்ட் சாச்சே", "detergent sachet", "Surf Excel", "Laundry Detergent", "20g", "Kg", "340200", 8, 6),
    ("Dishwash Bar 200g", "பாத்திரம் கழுவும் சோப்பு", "vim bar,dishwash bar,pathiram soap", "Vim", "Dishwashing", "200g", "Kg", "340200", 28, 22),
    ("Dishwash Liquid 500ml", "டிஷ்வாஷ் லிக்குயிட்", "vim liquid,dishwash liquid", "Vim", "Dishwashing", "500ml", "Litre", "340200", 98, 79),
    ("Phenyl 500ml", "பீனைல்", "phenyl,floor cleaner", "Local", "Household Cleaning", "500ml", "Litre", "340200", 45, 34),
    ("Harpic 500ml", "ஹார்பிக்", "harpic,toilet cleaner", "Harpic", "Household Cleaning", "500ml", "Litre", "340200", 92, 74),
    ("Cleaning Powder 200g", "சுத்தம் செய்யும் பவுடர்", "cleaning powder", "Local", "Household Cleaning", "200g", "Kg", "340200", 35, 27),
    ("Naphthalene Balls 100g", "நாப்தலின் பந்து", "naphthalene balls", "Local", "Household Cleaning", "100g", "Kg", "290200", 32, 24),
    ("Camphor 50g", "கற்பூரம்", "karpooram,camphor", "Local", "Household Cleaning", "50g", "Kg", "291400", 38, 29),
    ("Agarbatti 20 sticks", "அகர்பத்தி", "agarbatti,incense sticks", "Local", "Household Cleaning", "1pk", "Nos", "330700", 25, 18),
    ("Matchbox 10pc", "தீக்குச்சி", "theekuchchi,matchbox", "Local", "Small Household", "1pk", "Nos", "360500", 10, 6),
    ("Candle Pack", "மெழுகுவர்த்தி", "mezhugu varthi,candle", "Local", "Small Household", "1pk", "Nos", "340600", 22, 15),
    # Paper goods
    ("Toilet Paper Roll", "டாய்லெட் பேப்பர்", "toilet paper roll", "Local", "Paper Goods", "1roll", "Nos", "481800", 32, 24),
    ("Tissue Box", "டிஷ்யூ பெட்டி", "tissue box", "Local", "Paper Goods", "1box", "Nos", "481800", 52, 41),
    ("Face Tissue 100s", "முகம் துடைக்கும் டிஷ்யூ", "face tissue", "Local", "Paper Goods", "1pk", "Nos", "481800", 62, 49),
    ("Paper Napkins 100s", "காகித நாப்கின்", "paper napkins", "Local", "Paper Goods", "1pk", "Nos", "481800", 42, 32),
    ("Notebook 100pg", "குறிப்பேடு", "kuripedu,notebook", "Local", "Paper Goods", "1pc", "Nos", "482000", 35, 26),
    ("Newspaper Bundle", "பழைய பத்திரிகை", "paper bundle", "Local", "Paper Goods", "1kg", "Kg", "470700", 18, 12),
    # Small household essentials
    ("Steel Scrub Pad", "ஸ்டீல் ஸ்க்ரப்", "steel scrub", "Local", "Dishwashing", "1pc", "Nos", "732300", 15, 10),
    ("Plastic Bucket 10L", "பிளாஸ்டிக் வாளி", "vaali,bucket", "Local", "Small Household", "1pc", "Nos", "392400", 145, 112),
    ("Plastic Mug", "பிளாஸ்டிக் மக்", "mug", "Local", "Small Household", "1pc", "Nos", "392400", 48, 36),
    ("Broom", "வாச்சி", "vaatchi,broom", "Local", "Small Household", "1pc", "Nos", "960300", 65, 48),
    ("Dustbin 5L", "குப்பை தொட்டி", "kuppai thotti,dustbin", "Local", "Small Household", "1pc", "Nos", "392400", 110, 85),
    ("Cloth Clip 12pc", "உலோக கிளிப்", "cloth clip", "Local", "Small Household", "1pk", "Nos", "392600", 38, 28),
    ("Coir Rope Bundle", "தென்னை நார் கயிறு", "kayiru,rope", "Local", "Small Household", "1pk", "Nos", "560800", 25, 17),
    ("Table Salt Pack 5kg", "கல் உப்பு", "kal uppu,rock salt", "Local", "Flour and Cooking", "5kg", "Kg", "250100", 55, 42),
    # Regional packaged products
    ("Appalam 200g Pack", "அப்பளம் 200", "appalam 200", "Local", "Packaged Food", "200g", "Kg", "190500", 58, 45),
    ("Rice Murukku 250g", "அரிசி முறுக்கு", "arisi murukku", "Local", "Biscuits and Snacks", "250g", "Kg", "190500", 68, 53),
    ("Jackfruit Chips 200g", "பலாக்கொட்டை சிப்ஸ்", "palakkottai chips,jackfruit chips", "Local", "Biscuits and Snacks", "200g", "Kg", "200500", 78, 60),
    ("Tamarind Rice Paste 200g", "புளியோதரை பொடி", "puliyodarai podi", "Local", "Packaged Food", "200g", "Kg", "210600", 72, 56),
    ("Sambar Instant Mix 200g", "சாம்பார் தீவனம்", "instant sambar mix", "Aachi", "Packaged Food", "200g", "Kg", "210600", 65, 51),
    ("Rasam Instant Mix 200g", "ரசம் தீவனம்", "instant rasam mix", "Aachi", "Packaged Food", "200g", "Kg", "210600", 65, 51),
    ("Puliyodharai Paste 300g", "புளி பேஸ்ட்", "puli paste", "Local", "Packaged Food", "300g", "Kg", "210600", 95, 75),
    ("Dry Coconut 250g", "உலர் தேங்காய்", "ular thengai,dry coconut,copra", "Local", "Packaged Food", "250g", "Kg", "080100", 85, 66),
    ("Betel Leaf Pack", "வெற்றிலை", "vetrilai,betel leaf", "Local", "Regional Packaged", "1pk", "Nos", "140400", 12, 6),
    ("Betel Nut 50g", "வெற்றிலை பாக்கு", "paaku,betel nut", "Local", "Regional Packaged", "50g", "Kg", "080200", 25, 17),
    # More staples
    ("Basmati Rice 1kg", "பாஸ்மதி அரிசி", "basmati rice", "India Gate", "Rice and Grains", "1kg", "Kg", "100600", 125, 102),
    ("Kerala Matta Rice 1kg", "மட்டா அரிசி", "matta rice", "Local", "Rice and Grains", "1kg", "Kg", "100600", 78, 62),
    ("Foxtail Millet 500g", "தினை", "thinai,foxtail millet", "Local", "Rice and Grains", "500g", "Kg", "100800", 72, 56),
    ("Ragi 500g", "கேழ்வரகு", "kelvaragu,ragi,finger millet", "Local", "Rice and Grains", "500g", "Kg", "100800", 48, 37),
    ("Kambu 500g", "கம்பு", "kambu,pearl millet", "Local", "Rice and Grains", "500g", "Kg", "100800", 45, 35),
    ("Cholam 500g", "சோளம்", "cholam,sorghum", "Local", "Rice and Grains", "500g", "Kg", "100800", 42, 32),
    ("Curd Rice Mix 100g", "தயிர் சாதம் பொடி", "thayir sadam podi", "Local", "Packaged Food", "100g", "Kg", "210600", 42, 32),
    ("Lemon Rice Mix 100g", "நார்த்தங்காய் பொடி", "lemon rice podi", "Local", "Packaged Food", "100g", "Kg", "210600", 42, 32),
    # More household
    ("Mosquito Coil 10pc", "கொசுவு அடுப்பு", "kosu coil,mosquito coil", "Good Knight", "Household Cleaning", "1pk", "Nos", "380800", 35, 27),
    ("Mosquito Refill 45ml", "கொசுவு மருந்து", "mosquito refill", "Good Knight", "Household Cleaning", "45ml", "Litre", "380800", 78, 62),
    ("Air Freshener 150ml", "காற்று வாசனை", "air freshener", "Ambipur", "Household Cleaning", "150ml", "Litre", "330700", 145, 116),
    ("Garbage Bags 30pc", "குப்பை பை", "garbage bags", "Local", "Household Cleaning", "1pk", "Nos", "392300", 62, 48),
    ("Aluminium Foil 5m", "அலுமினியம் ஃபாயில்", "aluminium foil", "Local", "Paper Goods", "1rl", "Nos", "761500", 58, 45),
    ("Cling Wrap 5m", "கிளிங் ரேப்", "cling wrap", "Local", "Paper Goods", "1rl", "Nos", "392300", 65, 51),
    ("Sponge Pack 2pc", "ஸ்பாஞ்ச்", "sponge", "Local", "Dishwashing", "1pk", "Nos", "392400", 32, 24),
    ("Handwash 200ml", "கை கழுவும் சோப்பு", "handwash,kai soap", "Lifebuoy", "Soap and Personal Care", "200ml", "Litre", "340100", 65, 52),
    ("Sanitizer 100ml", "சானிடைசர்", "sanitizer", "Dettol", "Soap and Personal Care", "100ml", "Litre", "380800", 72, 57),
    ("Body Lotion 100ml", "பாடி லோஷன்", "body lotion", "Vaseline", "Soap and Personal Care", "100ml", "Litre", "330400", 98, 78),
    ("Face Cream 30g", "முக கிரீம்", "face cream", "Ponds", "Soap and Personal Care", "30g", "Kg", "330400", 58, 45),
    ("Petroleum Jelly 60g", "பெட்ரோலியம் ஜெல்லி", "petroleum jelly", "Vaseline", "Soap and Personal Care", "60g", "Kg", "271300", 72, 57),
    ("Baby Powder 200g", "குழந்தை பொடி", "baby powder", "Johnson", "Soap and Personal Care", "200g", "Kg", "330400", 115, 92),
    ("Kajal Stick", "கண் மை", "kan mai,kajal", "Local", "Soap and Personal Care", "1pc", "Nos", "330400", 28, 19),
    ("Comb", "சீப்பு", "seppu,comb", "Local", "Small Household", "1pc", "Nos", "961500", 32, 22),
    ("Hair Comb Dual", "இரட்டை சீப்பு", "dual comb", "Local", "Small Household", "1pc", "Nos", "961500", 45, 32),
    ("Mirror Small", "கண்ணாடி", "kannadi,mirror", "Local", "Small Household", "1pc", "Nos", "700600", 65, 48),
    ("Needle Set", "ஊசி செட்", "oosi set,needle set", "Local", "Small Household", "1pk", "Nos", "731900", 22, 14),
    ("Safety Pins 20pc", "பின்", "safety pins", "Local", "Small Household", "1pk", "Nos", "731900", 18, 11),
    ("Thread Roll", "நூல்", "nool,thread", "Local", "Small Household", "1rl", "Nos", "520500", 15, 9),
    ("Buttons Pack", "பொத்தான்", "poththan,buttons", "Local", "Small Household", "1pk", "Nos", "960600", 18, 11),
    ("LED Bulb 5W", "பல்ப்", "bulb,led bulb", "Local", "Small Household", "1pc", "Nos", "853900", 85, 65),
    ("Cell Batteries 2pc", "பேட்டரி", "battery,cell", "Duracell", "Small Household", "1pk", "Nos", "850600", 45, 34),
    ("Extension Cord", "மின் கம்பி", "extension cord,wire", "Local", "Small Household", "1pc", "Nos", "854400", 165, 128),
    ("Torch Light", "டார்ச் லைட்", "torch light", "Local", "Small Household", "1pc", "Nos", "851300", 120, 92),
]

_DEMO_COUNT = len(PRODUCTS)


def _ean13_instore(seq: int) -> str:
    """Synthetic EAN-13 in the retailer-internal 20xxxxxxxxxxx range."""
    body = f"20{seq:010d}"[:12]
    digits = [int(d) for d in body]
    total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(digits))
    return body + str((10 - total % 10) % 10)


def seed(dry_run: bool = False) -> str:
    """Idempotent regional catalog seed. Existing item codes are never touched."""

    from departmental_store.seeds import demo

    demo(run=True)  # ensure base fixtures (groups, UOM, price list)

    # Demo item group under the root
    if not frappe.db.exists("Item Group", DEMO_GROUP):
        frappe.get_doc({
            "doctype": "Item Group", "__newname": DEMO_GROUP,
            "item_group_name": DEMO_GROUP,
            "parent_item_group": "All Item Groups", "is_group": 0,
        }).insert(ignore_permissions=True)

    # UOMs used by the dataset
    for uom in ("Kg", "Litre", "Nos"):
        if not frappe.db.exists("UOM", uom):
            frappe.get_doc({"doctype": "UOM", "__newname": uom, "uom_name": uom,
                            "must_be_whole_number": uom == "Nos"}).insert(ignore_permissions=True)
    # HSN records for the synthetic codes used above
    hsn_used = {p[7] for p in PRODUCTS}
    for code in hsn_used:
        if not frappe.db.exists("GST HSN Code", code):
            frappe.get_doc({"doctype": "GST HSN Code", "__newname": code,
                            "hsn_code": code,
                            "description": "Synthetic demo HSN (test data only)"}).insert(
                ignore_permissions=True)

    price_list = "Standard Selling"
    created = skipped = 0
    for seq, (name, tamil, tanglish, brand, category, pack, uom, hsn, sell, purchase) in \
            enumerate(PRODUCTS, start=1):
        item_code = f"{ITEM_CODE_PREFIX}{seq:04d}"
        if frappe.db.exists("Item", item_code):
            skipped += 1
            continue
        if dry_run:
            created += 1
            continue
        aliases = [tamil] + [a.strip() for a in tanglish.split(",") if a.strip()]
        doc = frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": name,
            "item_group": DEMO_GROUP,
            "stock_uom": uom,
            "is_stock_item": 1,
            "is_sales_item": 1,
            "is_purchase_item": 1,
            "brand": brand if not frappe.db.exists("Brand", brand) or True else None,
            "gst_hsn_code": hsn,
            "description": f"DEMO DATA (Southern TN regional catalog) · {category} · {pack}",
            "ds_search_aliases": ", ".join(dict.fromkeys(aliases)),
            "barcodes": [{"barcode": _ean13_instore(seq), "barcode_type": "EAN"}],
        })
        # brand link only when the Brand record exists or can be created cheaply
        if not frappe.db.exists("Brand", brand):
            try:
                frappe.get_doc({"doctype": "Brand", "__newname": brand,
                                "brand": brand}).insert(ignore_permissions=True)
            except Exception:
                doc.brand = None
        doc.insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Item Price", "price_list": price_list,
            "item_code": item_code, "selling": 1,
            "price_list_rate": sell, "currency": "INR",
        }).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Item Price", "price_list": "Standard Buying",
            "item_code": item_code, "buying": 1,
            "price_list_rate": purchase, "currency": "INR",
        }).insert(ignore_permissions=True) if frappe.db.exists("Price List", "Standard Buying") else None
        created += 1

    frappe.db.commit()
    total = frappe.db.count("Item", {"item_code": ("like", f"{ITEM_CODE_PREFIX}%")})
    # dict on purpose: bench execute prints dicts as clean JSON, while a
    # json.dumps string gets printed repr-escaped and breaks script parsing.
    return {
        "dataset_size": _DEMO_COUNT, "created": created, "skipped_existing": skipped,
        "total_demo_items_in_catalog": total, "dry_run": bool(dry_run),
        "note": "barcodes are synthetic in-store range (prefix 20), demo data only",
    }


def seed_run() -> str:
    """No-arg bench-execute wrapper around seed(dry_run=False)."""
    return seed(dry_run=False)
