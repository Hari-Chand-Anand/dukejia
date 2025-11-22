// Products Admin (vanilla JS)
let products = [];
let filtered = [];
let editingIndex = null;

const tbody = document.getElementById("tbody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusText = document.getElementById("statusText");
const reloadBtn = document.getElementById("reloadBtn");
const saveAllBtn = document.getElementById("saveAllBtn");
const addBtn = document.getElementById("addBtn");

// modal elements
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const deleteBtn = document.getElementById("deleteBtn");
const productForm = document.getElementById("productForm");
const toastEl = document.getElementById("toast");

function toast(msg, ok=true){
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastEl.style.borderColor = ok ? "#2a7c4d" : "#8a2a3e";
  setTimeout(()=>toastEl.classList.add("hidden"), 2200);
}

async function fetchProducts(){
  statusText.textContent = "Loading...";
  try{
    const res = await fetch("/api/products", {cache:"no-store"});
    if(!res.ok) throw new Error("API not available");
    products = await res.json();
  }catch(e){
    // fallback to static JSON when API not present
    const res2 = await fetch("../data/products.json", {cache:"no-store"});
    products = await res2.json();
  }
  buildCategoryOptions();
  applyFilter();
  statusText.textContent = "";
}

function buildCategoryOptions(){
  const cats = Array.from(new Set(products.map(p => (p.category||"").trim()).filter(Boolean))).sort();
  categoryFilter.innerHTML = `<option value="">All categories</option>` + cats.map(c=>`<option value="${c}">${c}</option>`).join("");
}

function applyFilter(){
  const q = searchInput.value.trim().toLowerCase();
  const c = categoryFilter.value.trim().toLowerCase();
  filtered = products.filter(p=>{
    const hay = `${p.id||""} ${p.name||""} ${p.category||""} ${p.brand||""} ${p.model||""}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okC = !c || (p.category||"").toLowerCase()===c;
    return okQ && okC;
  });
  renderTable();
}

function renderTable(){
  tbody.innerHTML = "";
  if(filtered.length===0){
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  for(const p of filtered){
    const idx = products.findIndex(x=>x.id===p.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><code>${escapeHtml(p.id||"")}</code></td>
      <td>
        <div class="name">${escapeHtml(p.name||"")}</div>
        <div class="desc">${escapeHtml(p.description||"")}</div>
      </td>
      <td>${escapeHtml(p.category||"")}</td>
      <td>${escapeHtml(p.brand||"")}</td>
      <td>${escapeHtml(p.model||"")}</td>
      <td>
        <div class="actions">
          <button class="btn small" data-edit="${idx}">Edit</button>
          <button class="btn small danger" data-del="${idx}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function openModal(mode, idx=null){
  editingIndex = idx;
  modalTitle.textContent = mode==="edit" ? "Edit Product" : "Add Product";
  deleteBtn.classList.toggle("hidden", mode!=="edit");
  productForm.reset();

  if(mode==="edit" && idx!=null){
    const p = products[idx];
    productForm.id.value = p.id||"";
    productForm.name.value = p.name||"";
    productForm.category.value = p.category||"";
    productForm.brand.value = p.brand||"";
    productForm.model.value = p.model||"";
    productForm.thumbnail.value = p.thumbnail||"";
    productForm.description.value = p.description||"";
    productForm.tags.value = Array.isArray(p.tags)?p.tags.join(", "):(p.tags||"");
    productForm.media.value = Array.isArray(p.media)?p.media.join("\n"):(p.media||"");
    productForm.features.value = Array.isArray(p.features)?p.features.join("\n"):(p.features||"");
    productForm.spec.value = p.spec ? JSON.stringify(p.spec, null, 2) : "{}";
  }else{
    productForm.spec.value = "{}";
  }

  modalBackdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
}

function closeModal(){
  modalBackdrop.classList.add("hidden");
  modal.classList.add("hidden");
  editingIndex = null;
}

function upsertProductFromForm(){
  const form = new FormData(productForm);
  const id = (form.get("id")||"").trim();
  const name = (form.get("name")||"").trim();
  const category = (form.get("category")||"").trim();
  if(!id || !name || !category) throw new Error("Id, Name, Category are required");

  const tagsStr = (form.get("tags")||"").trim();
  const mediaStr = (form.get("media")||"").trim();
  const featuresStr = (form.get("features")||"").trim();
  const specStr = (form.get("spec")||"{}").trim();

  let specObj = {};
  try{
    specObj = specStr ? JSON.parse(specStr) : {};
  }catch(e){
    throw new Error("Spec must be valid JSON");
  }

  const product = {
    id,
    name,
    category,
    brand: (form.get("brand")||"").trim(),
    model: (form.get("model")||"").trim(),
    thumbnail: (form.get("thumbnail")||"").trim(),
    description: (form.get("description")||"").trim(),
    tags: tagsStr ? tagsStr.split(",").map(x=>x.trim()).filter(Boolean) : [],
    media: mediaStr ? mediaStr.split("\n").map(x=>x.trim()).filter(Boolean) : [],
    features: featuresStr ? featuresStr.split("\n").map(x=>x.trim()).filter(Boolean) : [],
    spec: specObj
  };

  // preserve unknown fields if editing
  if(editingIndex!=null){
    const old = products[editingIndex];
    products[editingIndex] = { ...old, ...product };
  }else{
    if(products.some(p=>p.id===id)){
      throw new Error("Product with same ID already exists");
    }
    products.unshift(product);
  }
}

async function saveAll(){
  statusText.textContent = "Saving...";
  try{
    const res = await fetch("/api/products", {
      method:"PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(products)
    });
    if(!res.ok) throw new Error(await res.text());
    toast("Products saved to products.json ✅");
  }catch(e){
    console.warn(e);
    toast("Cannot write on server. Downloading products.json...", false);
    downloadJson();
  }finally{
    statusText.textContent = "";
  }
}

function downloadJson(){
  const blob = new Blob([JSON.stringify(products, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "products.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function deleteProduct(idx){
  const p = products[idx];
  if(!p) return;
  if(!confirm(`Delete product "${p.name}" (${p.id})?`)) return;
  products.splice(idx,1);
  applyFilter();
  toast("Deleted. Click Save All to persist.");
}

function escapeHtml(s){
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// events
searchInput.addEventListener("input", applyFilter);
categoryFilter.addEventListener("change", applyFilter);
reloadBtn.addEventListener("click", fetchProducts);
saveAllBtn.addEventListener("click", saveAll);
addBtn.addEventListener("click", ()=>openModal("add"));

tbody.addEventListener("click", (e)=>{
  const editIdx = e.target?.dataset?.edit;
  const delIdx = e.target?.dataset?.del;
  if(editIdx!=null) openModal("edit", Number(editIdx));
  if(delIdx!=null) deleteProduct(Number(delIdx));
});

closeModalBtn.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
deleteBtn.addEventListener("click", ()=>{
  if(editingIndex!=null){
    deleteProduct(editingIndex);
    closeModal();
  }
});

productForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  try{
    upsertProductFromForm();
    applyFilter();
    toast(editingIndex!=null ? "Updated. Click Save All to persist." : "Added. Click Save All to persist.");
    closeModal();
  }catch(err){
    alert(err.message);
  }
});

fetchProducts();
