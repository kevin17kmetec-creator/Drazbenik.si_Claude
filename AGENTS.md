# Agent Custom Instructions

## Active Testing Phase Modifications
The following rules and logic constraints are currently **DISABLED** or **MODIFIED** strictly for the testing phase based on user request. When the testing phase concludes, the user will request to "remove testing phases" and these should be REVERTED to their original secure/production state.

1. **Date/Time Constraints for Auctions**: Disabled frontend time limits (`isValidTime`) and date limitations (`minDateLimit`, `maxDateLimit`) in `src/components/CreateAuctionForm.tsx` so the user can freely create auctions that mock ending in 1 minute or anytime outside standard hours.
