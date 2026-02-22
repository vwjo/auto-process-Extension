// --- INIT 4 TABLES ---
const bodies = [
	document.getElementById('sheetBody0'),
	document.getElementById('sheetBody1'),
	document.getElementById('sheetBody2'),
	document.getElementById('sheetBody3')
];

const logBox = document.getElementById('logBox');
const statusTag = document.getElementById('statusTag');
let isRunning = false;
let syncInterval = null;
let activeTab = 0;
let lastSelectedIndex = null;
let currentProcessingTab = 1;
let lastDataFoundTime = Date.now();
const TAB_SWITCH_TIMEOUT = 10000;

// Global Variables for Domains & Unique IDs & Auto Send
let targetDomains = [];
let uniqueIds = [];
let scriptUrl = "";
let isAutoSending = false;
let autoSendInterval = null;
let isSending = false;

// Default Dynamic Column Mapping
let columnMapping = [
    { id: "Z", coin: "AA", amount: "AB", info: "AG" }, // Tab 1
    { id: "J", coin: "K", amount: "L", info: "Q" },    // Tab 2
    { id: "R", coin: "S", amount: "T", info: "Y" },    // Tab 3
    { id: "B", coin: "C", amount: "D", info: "I" }     // Tab 4
];

// Helper to convert Column Letter to Number (A->1, Z->26)
function columnToNumber(col) {
    if(!col) return 0;
    let base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', i, j, result = 0;
    for (i = 0, j = col.length - 1; i < col.length; i++, j--) {
        result += Math.pow(base.length, j) * (base.indexOf(col[i].toUpperCase()) + 1);
    }
    return result;
}

// --- PANEL STATUS DISPLAY UPDATE FUNCTION ---
function updateStatusUI() {
	statusTag.innerText = isRunning ? "STATUS: RUNNING" : "STATUS: STOPPED";
	statusTag.className = isRunning ? "status-indicator status-running" : "status-indicator status-stopped";
}

window.switchTab = function(index) {
	activeTab = index;
	// Loop reduced to 4 (0 to 3)
	for (let i = 0; i < 4; i++) {
		const content = document.getElementById(`tab-content-${i}`);
		if (content) {
			content.style.display = i === index ? 'flex' : 'none';
			if (i === index) content.classList.add('active');
			else content.classList.remove('active');
		}
		
		const btn = document.querySelectorAll('.tab-btn-nav')[i];
		if (btn) btn.classList.toggle('active', i === index);
	}
	updateStatusUI();
}

function getAllRows() {
	return document.querySelectorAll('tbody tr');
}

function saveToStorage() {
	const rows = getAllRows();
	let allData = [];
	rows.forEach(row => {
		const inputs = row.querySelectorAll('input');
		allData.push({
			val0: inputs[0].value,
			val1: inputs[1].value,
			val2: inputs[2].value,
			val3: inputs[3].value,
			success: row.classList.contains('row-success'),
			rejected: row.classList.contains('row-rejected'),
			ready: row.getAttribute('data-ready') === 'true',
			tabIndex: parseInt(row.closest('tbody').id.replace('sheetBody', '')) || 0
		});
	});
	chrome.storage.local.set({
		"saved_table_data": allData,
		"isRunning": isRunning
	});
}

// --- MAIN CONFIGURATION SAVING LOGIC (ACCORDION) ---
const toggleMainConfigBtn = document.getElementById('toggleMainConfigBtn');
const mainConfigContent = document.getElementById('mainConfigContent');
const mainConfigToggleIcon = document.getElementById('mainConfigToggleIcon');

if (toggleMainConfigBtn && mainConfigContent) {
	toggleMainConfigBtn.addEventListener('click', () => {
		if (mainConfigContent.style.display === 'none' || mainConfigContent.style.display === '') {
			mainConfigContent.style.display = 'flex';
		} else {
			mainConfigContent.style.display = 'none';
		}
	});
}

// --- DOMAIN SAVING LOGIC (ACCORDION & DYNAMIC INPUTS) ---
const toggleDomainBtn = document.getElementById('toggleDomainBtn');
const domainContent = document.getElementById('domainContent');
const domainToggleIcon = document.getElementById('domainToggleIcon');

if (toggleDomainBtn && domainContent && domainToggleIcon) {
	toggleDomainBtn.addEventListener('click', () => {
		if (domainContent.style.display === 'none' || domainContent.style.display === '') {
			domainContent.style.display = 'block';
		} else {
			domainContent.style.display = 'none';
		}
	});
}

const domainInputsContainer = document.getElementById('domainInputsContainer');

function renderDomainInputRow(domainValue = "") {
	const rowDiv = document.createElement('div');
	rowDiv.className = 'domain-input-row';
	
	const inputEl = document.createElement('input');
	inputEl.type = 'text';
	inputEl.className = 'domain-input-box';
	inputEl.placeholder = 'e.g. suksesbogil.com';
	inputEl.value = domainValue;
	inputEl.style.textAlign = 'left'; 
	inputEl.style.fontWeight = 'normal';

	const delBtn = document.createElement('button');
	delBtn.className = 'btn-domain-action btn-domain-del';
	delBtn.title = 'Remove this domain';
	
	delBtn.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="3 6 5 6 21 6"></polyline>
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
			<line x1="10" y1="11" x2="10" y2="17"></line>
			<line x1="14" y1="11" x2="14" y2="17"></line>
		</svg>
	`;
	
	delBtn.addEventListener('click', () => {
        rowDiv.style.opacity = '0';
        rowDiv.style.transform = 'translateX(50px)';
        setTimeout(() => {
		    rowDiv.remove();
        }, 300);
	});

	rowDiv.appendChild(inputEl);
	rowDiv.appendChild(delBtn);
	domainInputsContainer.appendChild(rowDiv);
}

function refreshDomainInputsUI(domainsArray) {
	domainInputsContainer.innerHTML = '';
	if (!domainsArray || domainsArray.length === 0) {
		renderDomainInputRow(""); 
	} else {
		domainsArray.forEach(d => renderDomainInputRow(d));
	}
}

const addDomainBoxBtn = document.getElementById('addDomainBoxBtn');
if (addDomainBoxBtn) {
    addDomainBoxBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
	addDomainBoxBtn.addEventListener('click', () => {
		renderDomainInputRow("");
        if(domainInputsContainer.scrollHeight > domainInputsContainer.clientHeight) {
            domainInputsContainer.scrollTop = domainInputsContainer.scrollHeight;
        }
	});
}

const saveDomainsBtn = document.getElementById('saveDomainsBtn');
if (saveDomainsBtn) {
	saveDomainsBtn.addEventListener('click', () => {
		const inputs = domainInputsContainer.querySelectorAll('.domain-input-box');
		let newDomains = [];
		inputs.forEach(inp => {
			const val = inp.value.trim();
			if (val !== "") newDomains.push(val);
		});
		targetDomains = newDomains;
		chrome.storage.local.set({ target_domains: targetDomains }, () => {
			addLog(`Target domains saved: ${targetDomains.length} domains.`, "#00ff9d");
			refreshDomainInputsUI(targetDomains); 
		});
	});
}

// --- UNIQUE ID SAVING LOGIC (ACCORDION & DYNAMIC INPUTS) ---
const toggleUniqueIdBtn = document.getElementById('toggleUniqueIdBtn');
const uniqueIdContent = document.getElementById('uniqueIdContent');
const uniqueIdToggleIcon = document.getElementById('uniqueIdToggleIcon');

if (toggleUniqueIdBtn && uniqueIdContent && uniqueIdToggleIcon) {
	toggleUniqueIdBtn.addEventListener('click', () => {
		if (uniqueIdContent.style.display === 'none' || uniqueIdContent.style.display === '') {
			uniqueIdContent.style.display = 'block';
		} else {
			uniqueIdContent.style.display = 'none';
		}
	});
}

const uniqueIdInputsContainer = document.getElementById('uniqueIdInputsContainer');

function renderUniqueIdInputRow(idValue = "") {
	const rowDiv = document.createElement('div');
	rowDiv.className = 'domain-input-row';
	
	const inputEl = document.createElement('input');
	inputEl.type = 'text';
	inputEl.className = 'domain-input-box';
	inputEl.placeholder = 'e.g. USER123';
	inputEl.value = idValue;
	inputEl.style.textAlign = 'left'; 
	inputEl.style.fontWeight = 'normal';

	const delBtn = document.createElement('button');
	delBtn.className = 'btn-domain-action btn-domain-del';
	delBtn.title = 'Remove this ID';
	
	delBtn.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="3 6 5 6 21 6"></polyline>
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h4a2 2 0 0 1 2 2v2"></path>
			<line x1="10" y1="11" x2="10" y2="17"></line>
			<line x1="14" y1="11" x2="14" y2="17"></line>
		</svg>
	`;
	
	delBtn.addEventListener('click', () => {
        rowDiv.style.opacity = '0';
        rowDiv.style.transform = 'translateX(50px)';
        setTimeout(() => {
		    rowDiv.remove();
        }, 300);
	});

	rowDiv.appendChild(inputEl);
	rowDiv.appendChild(delBtn);
	uniqueIdInputsContainer.appendChild(rowDiv);
}

function refreshUniqueIdInputsUI(idsArray) {
	uniqueIdInputsContainer.innerHTML = ''; 
	if (!idsArray || idsArray.length === 0) {
		renderUniqueIdInputRow(""); 
	} else {
		idsArray.forEach(d => renderUniqueIdInputRow(d));
	}
}

const addUniqueIdBoxBtn = document.getElementById('addUniqueIdBoxBtn');
if (addUniqueIdBoxBtn) {
    addUniqueIdBoxBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    `;
	addUniqueIdBoxBtn.addEventListener('click', () => {
		renderUniqueIdInputRow("");
        if(uniqueIdInputsContainer.scrollHeight > uniqueIdInputsContainer.clientHeight) {
            uniqueIdInputsContainer.scrollTop = uniqueIdInputsContainer.scrollHeight;
        }
	});
}

const saveUniqueIdsBtn = document.getElementById('saveUniqueIdsBtn');
if (saveUniqueIdsBtn) {
	saveUniqueIdsBtn.addEventListener('click', () => {
		const inputs = uniqueIdInputsContainer.querySelectorAll('.domain-input-box');
		let newIds = [];
		inputs.forEach(inp => {
			const val = inp.value.trim();
			if (val !== "") newIds.push(val);
		});
		uniqueIds = newIds;
		chrome.storage.local.set({ unique_ids: uniqueIds }, () => {
			addLog(`Unique IDs saved: ${uniqueIds.length} IDs.`, "#00ff9d");
			refreshUniqueIdInputsUI(uniqueIds); 
		});
	});
}

// --- API URL SAVING LOGIC ---
const toggleApiBtn = document.getElementById('toggleApiBtn');
const apiContent = document.getElementById('apiContent');
const apiToggleIcon = document.getElementById('apiToggleIcon');
const scriptUrlInput = document.getElementById('scriptUrlInput');
const saveScriptUrlBtn = document.getElementById('saveScriptUrlBtn');

if (toggleApiBtn && apiContent) {
	toggleApiBtn.addEventListener('click', () => {
		if (apiContent.style.display === 'none' || apiContent.style.display === '') {
			apiContent.style.display = 'block';
		} else {
			apiContent.style.display = 'none';
		}
	});
}

if (saveScriptUrlBtn) {
	saveScriptUrlBtn.addEventListener('click', () => {
		const url = scriptUrlInput.value.trim();
		scriptUrl = url;
		chrome.storage.local.set({ script_url: scriptUrl }, () => {
			addLog(`URL Web App saved.`, "#00ff9d");
		});
	});
}

// --- COLUMN MAPPING LOGIC ---
const toggleColumnMapBtn = document.getElementById('toggleColumnMapBtn');
const columnMapContent = document.getElementById('columnMapContent');
const saveMappingBtn = document.getElementById('saveMappingBtn');

if (toggleColumnMapBtn && columnMapContent) {
	toggleColumnMapBtn.addEventListener('click', () => {
		if (columnMapContent.style.display === 'none' || columnMapContent.style.display === '') {
			columnMapContent.style.display = 'block';
		} else {
			columnMapContent.style.display = 'none';
		}
	});
}

function refreshColumnMappingUI() {
	for (let i = 0; i < 4; i++) {
		const map = columnMapping[i];
		const idEl = document.getElementById(`map_id_${i}`);
		const coinEl = document.getElementById(`map_coin_${i}`);
		const amountEl = document.getElementById(`map_amount_${i}`);
		const infoEl = document.getElementById(`map_info_${i}`);
		if (idEl) idEl.value = map.id;
		if (coinEl) coinEl.value = map.coin;
		if (amountEl) amountEl.value = map.amount;
		if (infoEl) infoEl.value = map.info;
	}
}

if (saveMappingBtn) {
	saveMappingBtn.addEventListener('click', () => {
		let newMapping = [];
		for(let i=0; i<4; i++) {
			let inputId = document.getElementById(`map_id_${i}`).value.trim().toUpperCase();
			let inputCoin = document.getElementById(`map_coin_${i}`).value.trim().toUpperCase();
			let inputAmount = document.getElementById(`map_amount_${i}`).value.trim().toUpperCase();
			let inputInfo = document.getElementById(`map_info_${i}`).value.trim().toUpperCase();
			
			newMapping.push({
				id: inputId || columnMapping[i].id,
				coin: inputCoin || columnMapping[i].coin,
				amount: inputAmount || columnMapping[i].amount,
				info: inputInfo || columnMapping[i].info
			});
		}
		columnMapping = newMapping;
		chrome.storage.local.set({ column_mapping: columnMapping }, () => {
			addLog(`Column mapping saved successfully.`, "#00ff9d");
			refreshColumnMappingUI(); 
		});
	});
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
	const tabButtons = document.querySelectorAll('.tab-btn-nav');
	tabButtons.forEach((btn, index) => {
		btn.addEventListener('click', () => {
			window.switchTab(index);
		});
	});
	
	chrome.storage.local.get(["saved_table_data", "isRunning", "target_domains", "unique_ids", "script_url", "column_mapping"], (res) => {
		if (res.target_domains) {
            targetDomains = res.target_domains;
			refreshDomainInputsUI(targetDomains);
        } else {
			refreshDomainInputsUI([]); 
		}

		if (res.unique_ids) {
            uniqueIds = res.unique_ids;
			refreshUniqueIdInputsUI(uniqueIds);
        } else {
			refreshUniqueIdInputsUI([]); 
		}
		
		if (res.script_url) {
			scriptUrl = res.script_url;
			scriptUrlInput.value = scriptUrl;
		}

		// Load Column Mapping if exists
		if (res.column_mapping) {
			columnMapping = res.column_mapping;
		}
		refreshColumnMappingUI(); // Fill UI with either loaded or default values

		bodies.forEach(b => b.innerHTML = "");
		
		if (res.saved_table_data && res.saved_table_data.length > 0) {
			let tabCounts = [0, 0, 0, 0]; 
			res.saved_table_data.forEach(d => {
				let tIdx = d.tabIndex !== undefined ? d.tabIndex : 0;
				if (tabCounts[tIdx] !== undefined) tabCounts[tIdx]++;
			});
			
			tabCounts.forEach((count, i) => {
				if (count === 0) createRows(100, i);
				else createRows(count, i);
			});
			
			const rows = getAllRows();
			res.saved_table_data.forEach((data, index) => {
				if (rows[index]) {
					const inputs = rows[index].querySelectorAll('input');
					inputs[0].value = data.val0 || "";
					inputs[1].value = data.val1 || "";
					inputs[2].value = data.val2 || "";
					inputs[3].value = data.val3 || "";
					if (data.success) rows[index].classList.add('row-success');
					if (data.rejected) rows[index].classList.add('row-rejected');
					if (data.ready) rows[index].setAttribute('data-ready', 'true');
				}
			});
			addLog("All table data was successfully recovered.");
		} else {
			for (let i = 0; i < 4; i++) createRows(100, i);
		}
		
		if (res.isRunning) {
			isRunning = true;
			startPolling();
		}
		updateStatusUI();
	});
	
	startStorageMonitor();
});

function createRows(count, targetTabIndex = activeTab) {
	if (!bodies[targetTabIndex]) return;

	const fragment = document.createDocumentFragment();
	const targetBody = bodies[targetTabIndex];
	let currentLocalIdx = targetBody.querySelectorAll('tr').length;
	
	for (let i = 0; i < count; i++) {
		const tr = document.createElement('tr');
		tr.setAttribute('data-index', currentLocalIdx);
		
		const tdIdx = document.createElement('td');
		tdIdx.className = 'row-index';
		tdIdx.innerText = currentLocalIdx + 1;
		tr.appendChild(tdIdx);
		
		for (let c = 0; c < 4; c++) {
			const td = document.createElement('td');
			const input = document.createElement('input');
			input.type = 'text';
			input.setAttribute('data-row', currentLocalIdx);
			input.setAttribute('data-col', c);
			input.readOnly = true;
			input.style.textAlign = "center";
			
			if (c === 1 || c === 2) input.classList.add('num-input');
			td.appendChild(input);
			tr.appendChild(td);
		}
		
		tr.addEventListener('click', function(e) {
			if (e.shiftKey && lastSelectedIndex !== null) {
				const rows = targetBody.querySelectorAll('tr');
				const start = Math.min(lastSelectedIndex, currentLocalIdx);
				const end = Math.max(lastSelectedIndex, currentLocalIdx);
				rows.forEach(r => {
					if (!r.classList.contains('row-success') && !r.classList.contains('row-rejected')) r.classList.remove('row-selected');
				});
				for (let i = start; i <= end; i++) {
					if (rows[i] && !rows[i].classList.contains('row-success') && !rows[i].classList.contains(
							'row-rejected')) rows[i].classList.add('row-selected');
				}
			} else {
				lastSelectedIndex = currentLocalIdx;
			}
		});
		
		tr.addEventListener('dblclick', function() {
			if (this.classList.contains('row-success') || this.classList.contains('row-rejected')) {
				if (confirm("Cancel the status of this row?")) {
					this.classList.remove('row-success', 'row-rejected');
					this.removeAttribute('data-ready');
					this.style.backgroundColor = "";
					addLog(`Row in Tab ${targetTabIndex+1} is reset.`);
					saveToStorage();
				}
			} else if (this.getAttribute('data-ready') === 'true') {
				this.removeAttribute('data-ready');
				this.style.backgroundColor = "";
				addLog(`Process Row in Tab ${targetTabIndex+1} canceled.`);
				saveToStorage();
			}
		});
		
		fragment.appendChild(tr);
		currentLocalIdx++;
	}
	targetBody.appendChild(fragment);
}

document.getElementById('addBtn').onclick = () => {
	const val = parseInt(document.getElementById('rowCountInput').value);
	if (val > 0) createRows(val, activeTab);
};

bodies.forEach((targetBody) => {
	targetBody.addEventListener('keydown', (e) => {
		if (e.target.tagName !== 'INPUT' || e.target.classList.contains('domain-input-box')) return;
		
		const r = parseInt(e.target.dataset.row);
		const c = parseInt(e.target.dataset.col);
		const input = e.target;
		const currentRow = targetBody.querySelector(`tr[data-index="${r}"]`);

		if (e.ctrlKey || e.metaKey) {
			const key = e.key.toLowerCase();
			if (key === 'c') {
				e.preventDefault();
				if (input.value) {
					navigator.clipboard.writeText(input.value).then(() => {});
				}
				return;
			}
			if (['v', 'x', 'z', 'y', 'a'].includes(key)) {
				input.readOnly = false;
				return; 
			}
		}
		
		if (input.readOnly) {
			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				input.value = "";
				currentRow.removeAttribute('data-ready');
				currentRow.classList.remove('row-success', 'row-rejected');
				currentRow.style.backgroundColor = "";
				saveToStorage();
				return;
			}
			if ((e.key === 'Enter' || e.key.length === 1) && !e.ctrlKey && !e.metaKey && !e.altKey) {
				input.readOnly = false;
				if (e.key !== 'Enter') return;
				e.preventDefault();
				input.select();
				return;
			}
		}
		
		if (e.key === 'ArrowRight') { e.preventDefault(); moveLocal(targetBody, r, c + 1); }
		if (e.key === 'ArrowLeft') { e.preventDefault(); moveLocal(targetBody, r, c - 1); }
		if (e.key === 'ArrowUp') { e.preventDefault(); moveLocal(targetBody, r - 1, c); }
		if (e.key === 'ArrowDown') { e.preventDefault(); moveLocal(targetBody, r + 1, c); }
		
		if (e.key === 'Enter') {
			e.preventDefault();
			const inputs = currentRow.querySelectorAll('input');
			const amount = inputs[2].value.trim();
			const info = inputs[3].value.trim();
			
			if (amount !== "" && info !== "") {
				currentRow.setAttribute('data-ready', 'true');
				const currentTabIdx = parseInt(targetBody.id.replace('sheetBody', '')) + 1;
				addLog(`[T${currentTabIdx}] ${info.toUpperCase()} (Rp${amount}) ADDED.`, "#50abe7");
				saveToStorage();
			}
			input.readOnly = true;
			moveLocal(targetBody, r + 1, c);
		}
	});
	
	targetBody.addEventListener('focusout', function(e) {
		if (e.target.classList.contains('num-input')) {
			let rawVal = e.target.value.trim().toLowerCase();
			if (rawVal === "") return;
			let processedNum;
			if (rawVal.includes('k')) processedNum = parseFloat(rawVal) * 1000;
			else if (rawVal.includes('e')) processedNum = Number(rawVal);
			else processedNum = Number(rawVal.replace(/,/g, ''));
			
			if (!isNaN(processedNum)) e.target.value = processedNum.toLocaleString('en-US');
		}
		e.target.readOnly = true;
		saveToStorage();
	});
	
	targetBody.addEventListener('focusin', function(e) {
		if (e.target.classList.contains('num-input')) e.target.value = e.target.value.replace(/,/g, '');
	});
});

function moveLocal(parentBody, r, c) {
	const target = parentBody.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
	if (target) {
		target.readOnly = true;
		target.focus();
		target.scrollIntoView({ block: 'nearest' });
	}
}

function addLog(msg, color = "white") {
	const time = new Date().toLocaleTimeString();
	logBox.innerHTML += `<div style="color: ${color};">[${time}] ${msg}</div>`;
	logBox.scrollTop = logBox.scrollHeight;
}

function startPolling() {
	if (syncInterval) clearInterval(syncInterval);
	syncInterval = setInterval(() => {
		if (isRunning) syncDataToExtension();
	}, 1000);
}

function syncDataToExtension() {
    const rows = getAllRows();
    let dataToProcess = [];
    let hasDataForCurrentTab = false;

    rows.forEach((row, index) => {
        const inputs = row.querySelectorAll('input');
        const amount = inputs[2].value.replace(/,/g, '').trim();
        const information = inputs[3].value.trim();
        const isSuccess = row.classList.contains('row-success');
        const isReady = row.getAttribute('data-ready') === 'true';
        
        const tabIdx = parseInt(row.closest('tbody').id.replace('sheetBody', '')) || 0;
        const currentTabNumber = tabIdx + 1;

        if (currentTabNumber === currentProcessingTab) {
            if (amount !== "" && information !== "" && !isSuccess && isReady) {
                hasDataForCurrentTab = true;
                
                let bankType = "BANK";
                const upInfo = information.toUpperCase();
                if (upInfo.includes("DOMPET ANAK BANGSA") || upInfo.includes("GOPAY")) bankType = "GOPAY";
                else if (upInfo.includes("VISIONET") || upInfo.includes("OVO")) bankType = "OVO";
                
                dataToProcess.push({
                    amount,
                    information,
                    bank: bankType,
                    rowIndex: index,
                    tabSource: currentTabNumber
                });
            }
        }
    });

    if (dataToProcess.length > 0) {
        lastDataFoundTime = Date.now();
        chrome.runtime.sendMessage({
            action: "START_AUTO_PROCESS",
            payload: dataToProcess
        });
    } else {
        let timeSinceLastActivity = Date.now() - lastDataFoundTime;
        if (!hasDataForCurrentTab || timeSinceLastActivity >= TAB_SWITCH_TIMEOUT) {
            currentProcessingTab++;
            if (currentProcessingTab > 4) currentProcessingTab = 1; 
            lastDataFoundTime = Date.now();
        }
    }
}

document.getElementById('startBtn').onclick = () => {
	if (isRunning) return;
	isRunning = true;
	updateStatusUI();
	addLog("Engine Active (Monitoring all Tables).", "#f39c12");
	
	const rows = getAllRows();
	rows.forEach(row => {
		const inputs = row.querySelectorAll('input');
		if (inputs[2].value !== "" && !row.classList.contains('row-success') && !row.classList.contains(
				'row-rejected')) {
			row.setAttribute('data-ready', 'true');
		}
	});
	
	saveToStorage();
	startPolling();
};

document.getElementById('stopBtn').onclick = () => {
	isRunning = false;
	updateStatusUI();
	if (syncInterval) clearInterval(syncInterval);
	chrome.runtime.sendMessage({ action: "STOP_AUTO_PROCESS" });
	saveToStorage();
	addLog("Engine Stopped.", "#f39c12");
};

document.getElementById('copyBtn').onclick = () => {
	const targetBody = bodies[activeTab];
	const rows = targetBody.querySelectorAll('tr');
	let copyText = "";
	rows.forEach(row => {
		const inputs = row.querySelectorAll('input');
		if (inputs[2].value.trim() !== "") {
			copyText += `${inputs[0].value}\t${inputs[1].value}\t${inputs[2].value}\t${inputs[3].value}\n`;
		}
	});
	navigator.clipboard.writeText(copyText).then(() => {
		addLog(`T${activeTab + 1} Data copied to clipboard.`);
	});
};

document.getElementById('deleteBtn').onclick = () => {
	if (confirm(`Clear data on TAB ${activeTab + 1} only?`)) {
		const targetBody = bodies[activeTab];
		const rows = targetBody.querySelectorAll('tr');
		rows.forEach(r => {
			const inputs = r.querySelectorAll('input');
			inputs.forEach(i => {
				i.value = "";
				i.readOnly = true;
			});
			r.classList.remove('row-success', 'row-rejected', 'row-selected');
			r.removeAttribute('data-ready');
			r.style.backgroundColor = "";
		});
		saveToStorage();
		addLog(`T${activeTab + 1} has been cleared.`);
	}
};

// CORE SEND LOGIC FUNCTION (REUSABLE)
async function processSendToSheet(isAuto) {
    if (isSending) return;

	if (!scriptUrl) {
		addLog("Error: Google Script URL not configured!", "#ff5252");
		if (isAuto) {
            clearTimeout(autoSendInterval);
            isAutoSending = false;
            const btn = document.getElementById('AutosendBtn');
            btn.innerText = "SEND AUTO";
            btn.classList.remove('active-stop');
        } else {
            alert("Please configure Google Script URL in Configuration first!");
        }
		return;
	}

	const targetBody = bodies[activeTab];
    const allRows = Array.from(targetBody.querySelectorAll('tr'));
    
    const rowsWithData = allRows.filter(row => {
        const inputs = row.querySelectorAll('input');
        return inputs[2].value.trim() !== "" && inputs[3].value.trim() !== "";
    });

    if (rowsWithData.length === 0) {
        if (!isAuto) addLog(`T${activeTab + 1} No data to send.`, "#ff5252");
        return;
    }

    const pendingRows = rowsWithData.filter(row => !row.classList.contains('row-success'));
    
    if (pendingRows.length > 0) {
        addLog(`T${activeTab + 1} Send canceled: some rows are not Process yet.`, "#f39c12");
        return;
    }

    const rows = rowsWithData;

    if (!isAuto) {
        if (!confirm(`Send ${rows.length} processed rows from TABLE ${activeTab + 1} to Google Sheets?`)) return;
    }

    isSending = true; 
    addLog(`Sending ${rows.length} items to Sheet (${isAuto ? 'AUTO' : 'MANUAL'})...`, "#f1c40f");

    const payloadRows = rows.map(row => {
        const inputs = row.querySelectorAll('input');
        return {
            id: inputs[0].value,
            coin: inputs[1].value,
            amount: inputs[2].value,
            info: inputs[3].value
        };
    });

	// Get current dynamic column mapping for the active tab
	const currentMap = columnMapping[activeTab];
	const payloadMap = {
		id: columnToNumber(currentMap.id),
		coin: columnToNumber(currentMap.coin),
		amount: columnToNumber(currentMap.amount),
		info: columnToNumber(currentMap.info)
	};

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tabIndex: activeTab,
                data: payloadRows,
				map: payloadMap // Sending dynamic maps to Apps Script
            })
        });
        
        addLog(`Data sent successfully! Clearing table...`, "#00ff9d");

        rows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            inputs.forEach(i => {
                i.value = "";
                i.readOnly = true;
            });
            row.classList.remove('row-success', 'row-rejected', 'row-selected');
            row.removeAttribute('data-ready');
            row.style.backgroundColor = "";
        });
        saveToStorage();

    } catch (error) {
        addLog(`Error sending data: ${error.message}`, "#ff5252");
    } finally {
        isSending = false; 
    }
}

document.getElementById('ManualsendBtn').onclick = () => {
    processSendToSheet(false);
};

document.getElementById('AutosendBtn').onclick = function() {
    if (isAutoSending) {
        clearTimeout(autoSendInterval);
        isAutoSending = false;
        this.innerText = "AUTO SEND";
        this.classList.remove('active-stop');
        addLog("Auto Send Stopped.", "#f39c12");
    } else {
        if (!scriptUrl) {
            alert("Please configure Google Script URL in Configuration first!");
            return;
        }
        
        isAutoSending = true;
        this.innerText = "STOP AUTO SEND";
        this.classList.add('active-stop');
        addLog("Auto Send Activated.", "#00ff9d");

        const runAutoCycle = async () => {
            if (!isAutoSending) return; 

            await processSendToSheet(true); 

            if (isAutoSending) {
                autoSendInterval = setTimeout(runAutoCycle, 70000);
            }
        };
        runAutoCycle();
    }
};

chrome.runtime.onMessage.addListener((message) => {
	const rows = getAllRows();
	
	if (message.action === "UPDATE_SHEET_ROW") {
		const { amount, information, foundId, rowIndex, tabSource } = message.payload;
		let targetRow = rows[rowIndex];
		
		if (targetRow && !targetRow.classList.contains('row-success')) {
			const inputs = targetRow.querySelectorAll('input');
			let numAmount = parseFloat(String(amount).replace(/,/g, ''));
			inputs[0].value = foundId;
			inputs[1].value = !isNaN(numAmount) ? numAmount.toLocaleString('en-US') : amount;
			
			targetRow.classList.remove('row-rejected'); 
			targetRow.classList.add('row-success');
			targetRow.removeAttribute('data-ready');
			targetRow.style.backgroundColor = "";
			
			const displayTab = tabSource || (parseInt(targetRow.closest('tbody').id.replace('sheetBody', '')) + 1);
			addLog(`[T${displayTab}] ${information.toUpperCase()} ACCEPT.`, "#00ff9d");
			saveToStorage();
		}
	}
	
	if (message.action === "ROW_REJECTED") {
		const { information, rowIndex, tabSource } = message.payload;
		let targetRow = rows[rowIndex];
		if (targetRow && !targetRow.classList.contains('row-rejected')) {
			targetRow.classList.add('row-rejected');
			const displayTab = tabSource || (parseInt(targetRow.closest('tbody').id.replace('sheetBody', '')) + 1);
			addLog(`[T${displayTab}] ${information.toUpperCase()} REJECT (DIFF AMOUNT).`, "#ff5252");
			saveToStorage();
		}
	}
});

let alivePort;
function connectBackground() {
	alivePort = chrome.runtime.connect({ name: "keepAlive" });
	alivePort.onDisconnect.addListener(() => setTimeout(connectBackground, 1000));
}
connectBackground();

function executeFilterRumus(tIdx) {
	const rawData = document.getElementById(`rawFilterInput${tIdx}`).value;
	if (!rawData.trim()) return;
	
	const lines = rawData.split('\n').map(l => l.trim());
	let matchCount = 0;
	const targetBody = bodies[tIdx];
	
	let targetRowIndex = 0;
	while (targetRowIndex < targetBody.querySelectorAll('tr').length) {
		const inputs = targetBody.querySelectorAll('tr')[targetRowIndex].querySelectorAll('input');
		if (inputs[2].value === "" && inputs[3].value === "") break;
		targetRowIndex++;
	}
	
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].toUpperCase() === "CR") {
			let saldo = (i >= 2) ? lines[i - 2] : "";
			let info = "";
			let lineM6 = (i >= 6) ? lines[i - 6] : "";
			let lineM7 = (i >= 7) ? lines[i - 7] : "";
			
			if (lineM6.toUpperCase().includes("ESPAY DEBIT")) {
				info = lineM7.toUpperCase().includes("TRFDN-") ? lineM7.split("TRFDN-")[1] : lineM7;
			} else if (lineM6.toUpperCase().includes("TRANSFER DR")) {
				info = lineM6.replace(/TRANSFER DR \d+/gi, "").trim();
			} else if (lineM6.toUpperCase().includes("TRFDN-")) {
				info = lineM6.split("TRFDN-")[1];
			} else {
				info = lineM6;
			}
			
			const checkVendor = (lineM6 + " " + lineM7).toUpperCase();
			if (checkVendor.includes("GOPAY") || checkVendor.includes("DOMPET ANAK BANGSA")) info = "DOMPET ANAK BANGSA";
			else if (checkVendor.includes("OVO") || checkVendor.includes("VISIONET")) info = "VISIONET";
			
			if (info) info = info.replace(/\./g, "");
			
			if (saldo || info) {
				if (targetRowIndex >= targetBody.querySelectorAll('tr').length) createRows(10, tIdx);
				const currentTableRows = targetBody.querySelectorAll('tr');
				const inputs = currentTableRows[targetRowIndex].querySelectorAll('input');
				
				inputs[2].value = saldo;
				inputs[3].value = info;
				currentTableRows[targetRowIndex].setAttribute('data-ready', 'true');
				
				if (saldo !== "") {
					let numSaldo = parseFloat(String(saldo).replace(/,/g, ''));
					if (!isNaN(numSaldo)) inputs[2].value = numSaldo.toLocaleString('en-US');
				}
				matchCount++;
				targetRowIndex++;
			}
		}
	}
	addLog(`Filter T${tIdx+1} Success: ${matchCount} data imported.`, "#3498db");
	document.getElementById(`rawFilterInput${tIdx}`).value = "";
	saveToStorage();
	if (isRunning) syncDataToExtension();
}

for (let i = 0; i < 4; i++) {
	const btnFilter = document.getElementById(`btnProcessFilter${i}`);
	if (btnFilter) btnFilter.addEventListener('click', () => executeFilterRumus(i));
}

let isDraggingRow = false;
let startDragIndex = null;
window.addEventListener('keydown', function(e) {
	if (e.key === 'Backspace' || e.key === 'Delete') {
		const selectedRows = bodies[activeTab].querySelectorAll('tr.row-selected');
		if (selectedRows.length > 0) {
			e.preventDefault();
			selectedRows.forEach(row => {
				const inputs = row.querySelectorAll('input');
				inputs.forEach(input => {
					input.value = "";
					input.readOnly = true;
				});
				row.removeAttribute('data-ready');
				row.classList.remove('row-success', 'row-rejected', 'row-selected');
				row.style.backgroundColor = "";
			});
			saveToStorage();
		}
	}
}, { capture: true });

document.addEventListener('mousedown', function(e) {
	if (e.target.classList.contains('row-index')) {
		const targetBody = e.target.closest('tbody');
		if (!targetBody) return;
		isDraggingRow = true;
		const tr = e.target.closest('tr');
		startDragIndex = parseInt(tr.getAttribute('data-index'));
		if (!e.ctrlKey && !e.shiftKey) {
			targetBody.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
		}
		tr.classList.add('row-selected');
	}
});

document.addEventListener('mouseover', function(e) {
	if (isDraggingRow && e.target.classList.contains('row-index')) {
		const tr = e.target.closest('tr');
		const targetBody = tr.closest('tbody');
		const currentIndex = parseInt(tr.getAttribute('data-index'));
		const rows = targetBody.querySelectorAll('tr');
		const start = Math.min(startDragIndex, currentIndex);
		const end = Math.max(startDragIndex, currentIndex);
		for (let i = start; i <= end; i++) {
			if (rows[i] && !rows[i].classList.contains('row-success')) rows[i].classList.add('row-selected');
		}
	}
});

window.addEventListener('mouseup', () => isDraggingRow = false);

document.addEventListener('focusin', function(e) {
	if (e.target.tagName === 'INPUT' && !e.target.classList.contains('domain-input-box')) {
		document.querySelectorAll('tbody tr.row-selected').forEach(r => r.classList.remove('row-selected'));
	}
});

window.addEventListener('copy', function(e) {
	if(e.target.tagName === 'INPUT' && window.getSelection().toString() !== '') return;
	
	const selectedRows = document.querySelectorAll('tbody tr.row-selected');
	if (selectedRows.length > 0) {
		e.preventDefault();
		let copyData = "";
		selectedRows.forEach(row => {
			const inputs = row.querySelectorAll('input');
			copyData += `${inputs[0].value}\t${inputs[1].value}\t${inputs[2].value}\t${inputs[3].value}\n`;
		});
		e.clipboardData.setData('text/plain', copyData);
	}
});

function startStorageMonitor() {
	const monitor = setInterval(() => {
		if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.storage?.local) {
			clearInterval(monitor);
			return;
		}
		chrome.storage.local.get(["saved_table_data", "isRunning", "script_url", "column_mapping"], (res) => {
			if (chrome.runtime.lastError) return;
			if (res && res.isRunning !== undefined) {
				if (res.isRunning !== isRunning) {
					isRunning = res.isRunning;
					if (isRunning) startPolling();
					else if (syncInterval) clearInterval(syncInterval);
					updateStatusUI();
				}
			}
			if (res.script_url && res.script_url !== scriptUrl) {
				scriptUrl = res.script_url;
				if (scriptUrlInput) scriptUrlInput.value = scriptUrl;
			}
		});
	}, 2500);
}

chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace === 'local') {
        if (changes.target_domains) {
            targetDomains = changes.target_domains.newValue || [];
			refreshDomainInputsUI(targetDomains);
        }

        if (changes.unique_ids) {
            uniqueIds = changes.unique_ids.newValue || [];
			refreshUniqueIdInputsUI(uniqueIds);
        }

		if (changes.script_url) {
			scriptUrl = changes.script_url.newValue;
			if (scriptUrlInput) scriptUrlInput.value = scriptUrl;
		}

		if (changes.column_mapping) {
			columnMapping = changes.column_mapping.newValue || columnMapping;
			refreshColumnMappingUI();
		}

		if (changes.isRunning) {
			const newIsRunning = changes.isRunning.newValue;
			if (newIsRunning !== isRunning) {
				isRunning = newIsRunning;
				if (isRunning) {
					startPolling();
					addLog("Active Engine (Triggered from another tab).", "#f39c12");
				} else {
					if (syncInterval) clearInterval(syncInterval);
					addLog("Engine Stop (Triggered from another tab).", "#f39c12");
				}
				updateStatusUI();
			}
		}
	}
});