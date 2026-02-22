// --- 1. HEARTBEAT MECHANISM ---
function keepAlive() {
	const keepAliveInterval = setInterval(() => {
		if (chrome.runtime.id) {
			chrome.runtime.getPlatformInfo(() => {});
		} else {
			clearInterval(keepAliveInterval);
		}
	}, 20000);
}

keepAlive();

chrome.runtime.onConnect.addListener((port) => {
	if (port.name === "keepAlive") {
		console.log("Keep-alive port connected.");
		port.onDisconnect.addListener(() => {
			console.log("Keep-alive port disconnected.");
		});
	}
});

// --- 2. LOGIC OF OPENING A TABLE PAGE ---
chrome.action.onClicked.addListener((tab) => {
	chrome.tabs.create({
		url: chrome.runtime.getURL("tableinput.html")
	});
});

// --- 3. COMMUNICATION HUB (REAL-TIME SYNCHRONIZATION) ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	sendResponse({
		status: "received"
	});
	
	// A. Sending process commands to the Target Website (Dynamically filtered)
	if (message.action === "START_AUTO_PROCESS" || message.action === "STOP_AUTO_PROCESS") {
        // Fetch dynamically saved domains from storage
        chrome.storage.local.get(["target_domains"], (res) => {
            const domains = res.target_domains || [];
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(t => {
                    // Check if the current tab url is contained in the user's domains list.
                    const isTarget = domains.some(domain => domain.trim() !== "" && t.url && t.url.includes(domain.trim()));
                    
                    if (t.status === 'complete' && isTarget) {
                        chrome.tabs.sendMessage(t.id, message).catch((err) => {
                            console.warn(`[Auto Process] Failed to send message to Tab ${t.id}:`, err.message);
                        });
                    }
                });
            });
        });
	}
	
	// B. Receive ID results from Website and send back to Spreadsheet
	if (message.action === "UPDATE_SHEET_ROW" || message.action === "ROW_REJECTED") {
		chrome.tabs.query({}, (tabs) => {
			tabs.forEach(t => {
				// checks whether the tab URL contains the extension ID and html file name
				if (t.url && t.url.includes(chrome.runtime.id) && t.url.includes("tableinput.html")) {
					chrome.tabs.sendMessage(t.id, message).catch(() => {
						console.log("Failed to send back to Input Table (Tab may be closed)");
					});
				}
			});
		});
	}
	return true; // Keeping communication channels open (Asynchronous)
});