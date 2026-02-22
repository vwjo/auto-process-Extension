//Variable lock to ensure data queues do not collide with each other
let isProcessingFeed = false;

async function transactionFeed() {
    // If the system is still processing previous typing/validation, wait in line.
    if (isProcessingFeed) return;

    try {
        // Retrieving the latest transaction data from the local server (bridge server)
        const response = await fetch('http://localhost:5000/get_data');
        const data = await response.json();
        
        if (data.status === 'success') {
            // Process lock so that other data is queued
            isProcessingFeed = true;

            // Define target table based on Device ID
            // Device 1 -> sheetBody0
            // Device 2 -> sheetBody1
            // Device 3 -> sheetBody2
            // Device 4 -> sheetBody3
            const targetTableId = 'sheetBody' + (data.device - 1);
            const tbody = document.getElementById(targetTableId); 

            // If the target table does not exist (for example, only plug in 1 cellphone but data is sent to 2 devices), ignore it.
            if (!tbody) {
                console.log(`Table for Device ${data.device} not found (${targetTableId})`);
                isProcessingFeed = false; // Remove the key
                return;
            }

            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Find blank rows in the target table
            let targetRow = rows.find(row => {
                const amountInput = row.querySelectorAll('input')[2];
                return amountInput && amountInput.value.trim() === "";
            });

            if (targetRow) {
                const inputs = targetRow.querySelectorAll('input');
                const amountInput = inputs[2];
                const infoInput = inputs[3];
                // Amount format
                const formatted = Number(data.amount).toLocaleString('en-US');

                // --- Enter Function ---
                const pressEnter = (el) => {
                    const params = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
                    el.dispatchEvent(new KeyboardEvent('keydown', params));
                    el.dispatchEvent(new KeyboardEvent('keyup', params));
                };

                // --- Input process for Amount ---
                const inputAmountOnly = (el, text, callback) => {
                    if (!el) return;
                    
                    el.focus();
                    el.value = text;
                    // Trigger input and change events so that the table is aware of changes in value.
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(() => {
                        el.blur();
                        if (callback) callback();
                    }, 100);
                };

                // --- Input process for Information ---
                const inputWithEnterValidation = (el, text, callback) => {
                    if (!el) return;

                    el.focus();
                    pressEnter(el); // ENTER 1: Enter Input Mode

                    setTimeout(() => {
                        el.value = text;
                        // Sinkronisasi DOM
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        setTimeout(() => {
                            pressEnter(el); // ENTER 2: Key & Validation (Row Validation Specifier)
                            
                            setTimeout(() => {
                                el.blur();
                                if (callback) callback();
                            }, 50); // Break to release focus
                        }, 100);
                    }, 100);
                };

                console.log(`PROCESSING DEVICE DATA ${data.device}: ${data.name} | ${formatted}`);

                // 1. Run for Amount
                inputAmountOnly(amountInput, formatted, () => {
                    // 2. Once the amount is complete, run it for Information (Name)
                    // Responsive gap between columns
                    setTimeout(() => {
                        inputWithEnterValidation(infoInput, data.name, () => {
                            // 3. Final Save Trigger (If there is a global saveToStorage function)
                            if (typeof saveToStorage === "function") saveToStorage();
                            
                            console.log(`DATA DEVICE ${data.device} COMPLETE.`);
                            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // Unlock the queue so that data from the next server can be processed.
                            isProcessingFeed = false;
                        });
                    }, 150);
                });
            } else {
                console.log(`Device Table ${data.device} Full!`);
                isProcessingFeed = false; // Remove the key
            }
        }
    } catch (err) {
        // Silent catch so that the console does not spam errors if the server is down
        isProcessingFeed = false; // Make sure the key is released if the server goes down unexpectedly
    }
}

// Run data check interval
setInterval(transactionFeed, 500);