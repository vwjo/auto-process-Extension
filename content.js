// ===================== CONSTANTS & CONFIG =====================
const CONFIG = {
	checkboxSelector: 'input[type="checkbox"]',
	acceptBtnSelector: 'input[type="submit"][value="Proses"], input[type="submit"][value="Accept"], button[name="proses"]',
	rejectBtnSelector: 'input[type="submit"][value="Reject"], input[type="submit"][value="Tolak"], button[name="reject"]',
	safeClickMinDelay: 50,
	safeClickMaxDelay: 50,
	systemDelay: 800,
	submitPrepareDelay: 100,
	reportDelay: 100,
	maxBatch: 10
};

// ===================== CLICKHELPER =====================
class ClickHelper {
	constructor(config) {
		this.config = config;
	}
	
	wait(ms) {
		return new Promise(r => setTimeout(r, ms));
	}
	
	waitRandom() {
		const min = this.config.safeClickMinDelay;
		const max = this.config.safeClickMaxDelay;
		const ms = Math.floor(Math.random() * (max - min + 1)) + min;
		return this.wait(ms);
	}
	
	async safeClick(el) {
		if (!el || el.disabled) return false;
		
		const isCheckbox = el.type === 'checkbox';
		const wasChecked = el.checked;
		
		await this.waitRandom();
		el.dispatchEvent(new MouseEvent('mousedown', {
			bubbles: true
		}));
		el.dispatchEvent(new MouseEvent('mouseup', {
			bubbles: true
		}));
		el.click();
		
		if (isCheckbox) {
			let timeout = 0;
			while (el.checked === wasChecked && timeout < 500) {
				await this.wait(50);
				timeout += 50;
			}
			
			if (el.checked === wasChecked) {
				console.log("Checkbox stuck, trying to force status...");
				el.checked = !wasChecked;
				el.dispatchEvent(new Event('change', {
					bubbles: true
				}));
			}
			
			// Anti-Race condition
			let confirmTimeout = 0;
			while (!el.checked && confirmTimeout < 500) {
				await this.wait(50);
				confirmTimeout += 50;
			}
		}
		
		await this.waitRandom();
		return true;
	}
}

// ===================== DOMFINDER =====================
class DOMFinder {
	constructor(config) {
		this.config = config;
	}
	
	getCheckbox(tr) {
		return tr.querySelector(this.config.checkboxSelector);
	}
	
	getAcceptButton() {
		let btn = document.querySelector(this.config.acceptBtnSelector);
		if (btn) return btn;
		const candidates = Array.from(document.querySelectorAll('input, button'));
		return candidates.find(el => {
			const text = (el.value || el.textContent || '').trim().toLowerCase();
			return text === 'proses' || text === 'accept';
		});
	}
	
	getRejectButton() {
		let btn = document.querySelector(this.config.rejectBtnSelector);
		if (btn) return btn;
		const candidates = Array.from(document.querySelectorAll('input, button'));
		return candidates.find(el => {
			const text = (el.value || el.textContent || '').trim().toLowerCase();
			return text === 'reject' || text === 'tolak';
		});
	}
}

// ===================== CORE ENGINE =====================
class AutoAcceptEngine {
	constructor() {
		this.active = false;
		this.db = [];
		this.uniqueIds = []; // Storage for Unique IDs
		this.clickHelper = new ClickHelper(CONFIG);
		this.domFinder = new DOMFinder(CONFIG);
		this.init();
		this.startStorageMonitor();
	}
	
	// Initialize Event Listener
	init() {
		chrome.runtime.onMessage.addListener((req) => {
			if (req.action === "START_AUTO_PROCESS") {
				this.db = req.payload;
				if (!this.active) {
					this.active = true;
					this.scanAndExecute();
					this.startObserver();
				}
			}
			if (req.action === "STOP_AUTO_PROCESS") {
				this.active = false;
				if (this.observer) this.observer.disconnect();
			}
		});
	}
	
	// DOM Change Monitor (Visual)
	startObserver() {
		if (this.observer) this.observer.disconnect();
		
		const targetNode = document.body;
		const config = {
			childList: true,
			subtree: true
		};
		
		const callback = () => {
			if (this.active && this.db.length > 0) {
				if (this.scanTimeout) clearTimeout(this.scanTimeout);
				this.scanTimeout = setTimeout(() => {
					this.scanAndExecute();
				}, CONFIG.systemDelay);
			}
		};
		
		this.observer = new MutationObserver(callback);
		this.observer.observe(targetNode, config);
	}
	
	// Queue Database Synchronization
	startStorageMonitor() {
		setInterval(() => {
			chrome.storage.local.get(["saved_table_data", "isRunning", "unique_ids"], (res) => {
				// Update uniqueIds from storage
				this.uniqueIds = res.unique_ids || [];
				
				if (res.isRunning) {
					const queue = (res.saved_table_data || [])
						.map((item, originalIndex) => ({
							item,
							originalIndex
						}))
						.filter(obj => obj.item.val2 && obj.item.val3 && !obj.item.success && obj
							.item.ready)
						.map(obj => {
							let bankType = "BANK";
							const upInfo = (obj.item.val3 || "").toUpperCase();
							if (upInfo.includes("DOMPET ANAK BANGSA") || upInfo.includes(
									"GOPAY")) bankType = "GOPAY";
							else if (upInfo.includes("VISIONET") || upInfo.includes("OVO"))
								bankType = "OVO";
							
							return {
								amount: obj.item.val2,
								information: obj.item.val3,
								bank: bankType,
								rowIndex: obj.originalIndex
							};
						});
					
					if (queue.length > 0) {
						const isDifferent = JSON.stringify(queue) !== JSON.stringify(this.db);
						this.db = queue;
						if (!this.active) {
							this.active = true;
							this.scanAndExecute();
							this.startObserver();
						} else if (isDifferent) {
							this.scanAndExecute();
						}
					}
				} else {
					this.active = false;
					if (this.observer) this.observer.disconnect();
				}
			});
		}, CONFIG.systemDelay);
	}
	
	// ===== VALIDATION BEFORE SUBMIT =====
	async validateAllProcessedCheckboxes() {
		const processedRows = document.querySelectorAll('tr[data-processed="true"]');
		let timeout = 0;
		
		while (timeout < 500) {
			let allChecked = true;
			
			for (const row of processedRows) {
				const cb = this.domFinder.getCheckbox(row);
				if (!cb || !cb.checked) {
					allChecked = false;
					break;
				}
			}
			
			if (allChecked) return true;
			
			await new Promise(r => setTimeout(r, 50));
			timeout += 50;
		}
		
		console.log("Validation timeout: Some checkboxes not confirmed checked.");
		return false;
	}
	
	async scanAndExecute() {
		// Fetch all tables present on a web page
		const allTables = Array.from(document.querySelectorAll('table'));
		
		// Loop alternately: Table 1, then Table 2, etc.
		for (let i = 0; i < allTables.length; i++) {
			const currentTable = allTables[i];
			
			// Focus on searching for rows only in the table currently being looped over.
			const rows = Array.from(currentTable.querySelectorAll('tr')).filter(tr => tr.querySelector(
				'input[id^="amountc"]'));
			
			// If this table is empty or has no relevant input, proceed to the next table.
			if (rows.length === 0) continue;
			
			let foundAccept = false;
			let foundReject = false;
			let reports = [];
			
			// The anyValidToAccept logic is tailored specifically to rows in this table only.
			const anyValidToAccept = rows.some(row => {
				const amtInp = row.querySelector('input[id^="amountc"]');
				const webAmt = amtInp ? amtInp.value.replace(/\D/g, '').trim() : "";
				const tds = row.querySelectorAll('td');
				if (tds.length < 7) return false;
				
				// Get ID for Unique ID check logic in anyValidToAccept
				const foundId = tds[2].innerText.trim().split(/[\s\n]+/)[0];
				const isVip = this.uniqueIds.some(uId => uId.trim() === foundId);
				
				const fullBankInfo = tds[6].innerText.trim();
				const parts = fullBankInfo.split(',');
				const webName = parts[parts.length - 1].trim().toLowerCase();
				
				return this.db.some(item => {
					const targetAmt = item.amount.toString().replace(/\D/g, '').trim();
					const targetName = item.information.toLowerCase().trim();
					
					if (isVip) {
						return webAmt === targetAmt;
					}
					return webName === targetName && webAmt === targetAmt;
				});
			});
			
			let processedCount = 0;
			// Process the rows in the currently active table.
			for (const row of rows) {
				if (processedCount >= CONFIG.maxBatch) break;
				
				const amtInp = row.querySelector('input[id^="amountc"]');
				if (!amtInp) continue;
				
				const webAmt = amtInp.value.replace(/\D/g, '').trim();
				const tds = row.querySelectorAll('td');
				if (tds.length < 7) continue;
				
				const fullBankInfo = tds[6].innerText.trim();
				const parts = fullBankInfo.split(',');
				const webName = parts[parts.length - 1].trim().toLowerCase();
				
				// Get Web ID for Unique ID Check
				const foundId = tds[2].innerText.trim().split(/[\s\n]+/)[0];
				const isVip = this.uniqueIds.some(uId => uId.trim() === foundId);
				
				for (const item of this.db) {
					const targetAmt = item.amount.toString().replace(/\D/g, '').trim();
					const targetName = item.information.toLowerCase().trim();
					const webBankInfo = tds[6].innerText.toUpperCase();
					
					const isEWallet = item.bank === "GOPAY" || item.bank === "OVO";
					let isMatch = false;
					
					if (isVip) {
						// If ID is found in Unique ID list, assume it matches identity,
						// check the amount in the next block.
						isMatch = true;
					} else if (isEWallet) {
						if (webBankInfo.includes(item.bank)) isMatch = true;
					} else {
						if (webName === targetName) isMatch = true;
					}
					
					if (isMatch) {
						const cb = this.domFinder.getCheckbox(row);
						if (!cb || cb.checked || row.getAttribute('data-processed') === 'true') continue;
						
						if (webAmt === targetAmt) {
							await this.clickHelper.safeClick(cb);
							
							// ===== PATCH: Re-validate checkbox from latest DOM to avoid race condition =====
							await new Promise(r => setTimeout(r, 0)); // yield to DOM / framework
							
							const freshRow = cb.closest('tr');
							if (!freshRow || !freshRow.isConnected) {
								console.log("Row replaced by DOM re-render, skipping.");
								continue;
							}
							
							const freshCheckbox = this.domFinder.getCheckbox(freshRow);
							if (!freshCheckbox || !freshCheckbox.checked) {
								console.log("Checkbox lost state after re-render, skipping.");
								continue;
							}
							
							freshRow.style.backgroundColor = "#d4edda";
							freshRow.setAttribute('data-processed', 'true');
							foundAccept = true;
							processedCount++;
							
							reports.push({
								action: "UPDATE_SHEET_ROW",
								payload: {
									amount: item.amount,
									information: item.information,
									foundId: foundId,
									rowIndex: item.rowIndex
								}
							});
							break;
						} else {
							if (isVip) {
								// If the Unique ID is registered but the amount is different,IGNORE.
								// Don't reject, just continue (break loop db items, continue next row)
								console.log(`[Unique ID Matched] ${foundId} found but Amount mismatch. Ignored.`);
								// Break inner loop (this.db) to stop checking other items for this row, essentially ignoring it.
							} else if (isEWallet) {
								console.log(`[E-Wallet Pending] ${item.bank} different Amount.`);
							} else {
								if (!anyValidToAccept) {
									await this.clickHelper.safeClick(cb);
									
									// --- Re-validate checkbox for reject to avoid fake submits ---
									await new Promise(r => setTimeout(r, 0));
									const freshRowRj = cb.closest('tr');
									if (!freshRowRj || !freshRowRj.isConnected) {
										break;
									}
									const freshCbRj = this.domFinder.getCheckbox(freshRowRj);
									if (!freshCbRj || !freshCbRj.checked) {
										console.log("Checkbox reject failed true, skip process status.");
										break;
									}
									
									freshRowRj.setAttribute('data-processed', 'true');
									
									foundReject = true;
									processedCount++;
									
									reports.push({
										action: "ROW_REJECTED",
										payload: {
											information: item.information,
											rowIndex: item.rowIndex
										}
									});
								}
							}
							break;
						}
					}
				}
			}
			
			// If there is an action in this table (these are ticked)
			// Submit for this table, then immediately exit (return) to avoid processing the next table.
			if (foundAccept || foundReject) {
				// --- validation before submitting and sending report---
				const isValid = await this.validateAllProcessedCheckboxes();
				if (!isValid) {
					console.log("cancel submit & report: initial validation found checkbox is not true.");
					return; // stop. forces the observer to reprocess due to failed validation.
				}
				
				if (reports.length > 0) {
					for (const msg of reports) {
						// --- Validate checkbox before sending report ---
						const checkRowsReport = document.querySelectorAll('tr[data-processed="true"]');
						let isStrictlyTrueForReport = true;
						
						for (const r of checkRowsReport) {
							const cb = this.domFinder.getCheckbox(r);
							if (!cb || cb.checked !== true) {
								isStrictlyTrueForReport = false;
								break;
							}
						}

						if (!isStrictlyTrueForReport) {
							console.log("Cancel send report: detects a false checkbox when sending a report. this aborts the entire process in this cycle..");
							return; // when return, cancel the report sending.
						}

						chrome.runtime.sendMessage(msg);
						await new Promise(r => setTimeout(r, CONFIG.reportDelay));
					}
				}
				
				await new Promise(r => setTimeout(r, CONFIG.submitPrepareDelay));
				
				// --- Final hard check status checkbox before pressing the submit button ---
				const finalCheckRows = document.querySelectorAll('tr[data-processed="true"]');
				let isStrictlyTrue = true;
				for (const r of finalCheckRows) {
					const cb = this.domFinder.getCheckbox(r);
					if (!cb || cb.checked !== true) {
						isStrictlyTrue = false;
						break;
					}
				}

				if (!isStrictlyTrue) {
					console.log("Cancel final submit: detect false checkbox just before executing submit click. waiting for observer.");
					return;
				}
				
				// --- Submit subject to conditions ---
				if (foundAccept) {
					const btn = this.domFinder.getAcceptButton();
					if (btn) await this.clickHelper.safeClick(btn);
				} else if (foundReject) {
					const rjBtn = this.domFinder.getRejectButton();
					if (rjBtn) await this.clickHelper.safeClick(rjBtn);
				}
				
				// prevents next table execution in this cycle
				return;
			}
		}
	}
}

// ===================== INIT CHECK DYNAMIC DOMAIN =====================
chrome.storage.local.get(["target_domains"], (res) => {
	const domains = res.target_domains || [];
	const currentUrl = window.location.href;
	
	const isTargetDomain = domains.some(domain => domain.trim() !== "" && currentUrl.includes(domain.trim()));
	if (isTargetDomain) {
		new AutoAcceptEngine();
	}
});