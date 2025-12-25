import { NextRequest, NextResponse } from "next/server";

const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "";
const PUBLIC_IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const parseCsvLine = (line: string) => {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  out.push(current);
  return out.map(v => v.trim());
};

const normalizeHeader = (h: string) =>
  h
    .replace(/^\uFEFF/, "")
    .replace(/"/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const normalizeImageKey = (s: string) => {
  const trimmed = String(s || "").trim();
  if (!trimmed) return "";
  const base = trimmed.split("/").pop()?.split("\\").pop() || trimmed;
  return base.trim();
};

const stripExtension = (filename: string) => filename.replace(/\.[^/.]+$/, "");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File;
    const imageFiles = formData.getAll("imageFiles") as File[];

    if (!csvFile) {
      return NextResponse.json({ success: false, error: "CSV文件是必需的" });
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ success: false, error: "至少需要上传一张图片" });
    }

    if (!PINATA_API_KEY || !PINATA_SECRET_API_KEY) {
      return NextResponse.json({ success: false, error: "缺少 Pinata 配置（PINATA_API_KEY / PINATA_SECRET_API_KEY）" });
    }

    // 解析CSV文件
    const csvText = await csvFile.text();
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const rawHeaders = parseCsvLine(lines[0]);
    const headers = rawHeaders.map(normalizeHeader);
    
    const nftData = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = parseCsvLine(lines[i]);
        const nft: any = {};
        headers.forEach((header, index) => {
          nft[header] = values[index] || "";
        });
        nftData.push({ __row: i + 1, ...nft });
      }
    }

    if (nftData.length === 0) {
      return NextResponse.json({ success: false, error: "CSV文件中没有有效数据" });
    }

    // 批量上传图片到Pinata
    const uploadedImages: { [key: string]: string } = {};
    
    for (const imageFile of imageFiles) {
      const imageFormData = new FormData();
      imageFormData.append("file", imageFile);
      
      const pinataMetadata = JSON.stringify({
        name: `NFT_Image_${imageFile.name}_${Date.now()}`,
      });
      imageFormData.append("pinataMetadata", pinataMetadata);

      const pinataOptions = JSON.stringify({
        cidVersion: 0,
      });
      imageFormData.append("pinataOptions", pinataOptions);

      const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
        body: imageFormData,
      });

      if (!pinataResponse.ok) {
        const errorText = await pinataResponse.text();
        console.error("Pinata upload error:", errorText);
        throw new Error(`Failed to upload image ${imageFile.name} to Pinata: ${errorText}`);
      }

      const pinataResult = await pinataResponse.json();
      const imageUrl = `${PUBLIC_IPFS_GATEWAY}${pinataResult.IpfsHash}`;
      const key = normalizeImageKey(imageFile.name);
      uploadedImages[key] = imageUrl;
      uploadedImages[key.toLowerCase()] = imageUrl;
      uploadedImages[stripExtension(key).toLowerCase()] = imageUrl;
    }

    // 为每个NFT创建元数据并上传到IPFS
    const metadataResults = [];
    const skipped: Array<{ row: number; reason: string; image_file?: string; name?: string }> = [];
    
    for (const nft of nftData) {
      const nftName = (nft.name || nft.nft_name || nft.title || "").trim();
      const imageFileValue = normalizeImageKey(nft.image_file || nft.image || nft.imagefile || nft.image_name || "");
      const imageKeyCandidates = [
        imageFileValue,
        imageFileValue.toLowerCase(),
        stripExtension(imageFileValue).toLowerCase(),
      ].filter(Boolean);
      const imageUrl = imageKeyCandidates.map(k => uploadedImages[k]).find(Boolean);
      if (!imageUrl) {
        skipped.push({
          row: Number(nft.__row) || -1,
          reason: "图片文件名未匹配到已上传图片",
          image_file: String(nft.image_file ?? ""),
          name: String(nft.name ?? ""),
        });
        continue;
      }
      if (!nftName) {
        skipped.push({
          row: Number(nft.__row) || -1,
          reason: "缺少 name 字段",
          image_file: String(nft.image_file ?? ""),
          name: String(nft.name ?? ""),
        });
        continue;
      }

      // 构建属性数组
      const attributes = [];
      for (let i = 1; i <= 3; i++) {
        const traitType = nft[`trait_type_${i}`];
        const traitValue = nft[`trait_value_${i}`];
        if (traitType && traitValue) {
          attributes.push({
            trait_type: traitType,
            value: traitValue
          });
        }
      }

      // 添加默认属性
      attributes.push({
        trait_type: "Batch Upload",
        value: "Excel Import"
      });
      attributes.push({
        trait_type: "Created",
        value: new Date().toISOString().split('T')[0]
      });

      const metadata = {
        name: nftName,
        description: (nft.description || nft.desc || "").trim() || `Custom NFT: ${nftName}`,
        image: imageUrl,
        attributes: attributes
      };

      // 上传元数据到Pinata
      const metadataResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
        body: JSON.stringify({
          pinataContent: metadata,
          pinataMetadata: {
            name: `${nftName}-metadata.json`,
          },
        }),
      });

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        console.error("Metadata upload error:", errorText);
        throw new Error(`Failed to upload metadata for ${nft.name} to Pinata: ${errorText}`);
      }

      const metadataResult = await metadataResponse.json();
      metadataResults.push({
        name: nftName,
        metadataHash: metadataResult.IpfsHash,
        imageUrl: imageUrl
      });
    }

    return NextResponse.json({
      success: true,
      message: `成功处理 ${metadataResults.length} 个NFT`,
      results: metadataResults,
      skipped
    });

  } catch (error) {
    console.error("Batch upload error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "批量上传失败"
    });
  }
}
