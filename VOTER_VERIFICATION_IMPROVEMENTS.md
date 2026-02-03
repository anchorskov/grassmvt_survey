# Wyoming Voter Verification Improvements

## Overview
Enhanced the Wyoming voter verification flow in `/api/location/verify-voter` with two key improvements:
1. **First name variant handling** - handles common name variants (Jim/James, Bob/Robert, etc.)
2. **City-to-zipcode fallback** - falls back to matching by zipcode when city doesn't match

## Implementation Details

### 1. First Name Variants Handler

**Location**: [src/worker.js](src/worker.js#L318-L358)

Added a new map of common first name variants:
- `jim` ↔ `james`
- `bob` ↔ `robert`
- `tom` ↔ `thomas`
- `bill` ↔ `william`, `will`
- `dick` ↔ `richard`
- `ben` ↔ `benjamin`
- `ted` ↔ `theodore`, `edward`
- `sam` ↔ `samuel`
- `dan` ↔ `daniel`
- `rob` ↔ `robert`
- `ed` ↔ `edward`, `edmund`
- `liz` ↔ `elizabeth`
- `alex` ↔ `alexander`, `alexandra`
- `chris` ↔ `christopher`, `christine`
- `pat` ↔ `patrick`, `patricia`
- `andy` ↔ `andrew`
- `meg` ↔ `margaret`

**Function**: `getFirstNameVariants(firstName)` 
- Returns an array of all possible variants for a given first name
- Always includes the original name in the results
- Maps any known variant back to all others in its group

### 2. City-to-Zipcode Fallback

**Location**: [src/worker.js](src/worker.js#L652-L686)

Implemented a three-strategy matching approach:

#### Strategy 1: Name + House Number + City (High Confidence)
- Tries all first name variants
- Matches on: first name, last name, city
- Validates house number and street name match
- Returns `high` confidence when house/street matches

#### Strategy 2: Name + City Only (Medium Confidence)
- If only one candidate matches name + city, accepts with `medium` confidence

#### Strategy 3: Name + Zipcode Fallback (Medium/High Confidence) 
- **NEW**: When city-based matching fails
- Tries all first name variants
- Matches on: first name, last name, zipcode
- Can still achieve `high` confidence if house/street matches with zipcode
- Falls back to `medium` confidence if only one candidate found

## Matching Flow

```
1. Extract variants for provided first name
2. For each variant:
   a. Try: fn + ln + city + house/street → HIGH confidence ✓
   b. Try: fn + ln + city (single result) → MEDIUM confidence ✓
   c. Try: fn + ln + zipcode + house/street → HIGH confidence ✓
   d. Try: fn + ln + zipcode (single result) → MEDIUM confidence ✓
3. If no match: return NO_MATCH
```

## Benefits

1. **Reduces false negatives** - "Jim Smith" can match "James Smith" in the voter file
2. **Handles typos in city** - If user enters wrong city but correct zipcode, still finds match
3. **Higher match rate** - Especially helpful in areas where city names might be ambiguous or abbreviated
4. **Maintains security** - Still requires name + address data, doesn't lower verification standards
5. **Confidence levels** - Tracks whether match was high/medium confidence for auditing

## Database Schema Assumptions

The implementation assumes the Wyoming voter database table `voters_addr_norm` has:
- `fn` - first name (normalized to lowercase)
- `ln` - last name (normalized to lowercase)
- `city` - city name (normalized to lowercase)
- `zip` - zipcode
- `addr1` - full address (for house number/street extraction)
- `voter_id` - unique identifier
- `house` - state house district
- `senate` - state senate district

## Testing Recommendations

1. **Name variant matching**
   - Test with "Jim" entry to verify it matches "James" in database
   - Test with "Bill" entry to verify it matches "William" variants

2. **City fallback**
   - Create test case with wrong city but correct zipcode
   - Verify it still finds match when city lookup fails

3. **Confidence levels**
   - Verify exact house/street match returns `high` confidence
   - Verify single city/zip result returns `medium` confidence
   - Verify unmatched cases return proper error codes

4. **Edge cases**
   - Unknown first names (no variants) should still work
   - Multiple candidates in city/zipcode should return NO_MATCH
   - Single candidates should be accepted with medium confidence
