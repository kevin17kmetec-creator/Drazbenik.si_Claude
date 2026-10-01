const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreateAuctionForm.tsx', 'utf8');

const targetCatch = `        } catch (error: any) { 
            if (cancelRef.current || error?.message === 'CANCELED' || error?.code === 'storage/canceled') {`;

const newCatch = `        } catch (error: any) { 
            if (error.correctedTimeStr) {
                setFormData(prev => ({ ...prev, endTime: error.correctedTimeStr }));
                setErrorMessage('');
                toast.success(error.message, { duration: 5000 });
                setUploading(false);
                return;
            }
            if (cancelRef.current || error?.message === 'CANCELED' || error?.code === 'storage/canceled') {`;

content = content.replace(targetCatch, newCatch);
fs.writeFileSync('src/components/auction/CreateAuctionForm.tsx', content);
