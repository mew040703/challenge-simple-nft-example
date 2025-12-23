"use server";

import { ipfsClient } from "~~/utils/simpleNFT/ipfs";

export async function POST(request: Request) {
  try {
    const { imageUrl, name, description, attributes } = await request.json();
    
    if (!imageUrl || !name) {
      return Response.json({ error: "Image URL and name are required" }, { status: 400 });
    }

    // Create NFT metadata
    const metadata = {
      name,
      description: description || `Custom NFT: ${name}`,
      image: imageUrl,
      external_url: "https://your-nft-collection.com", // You can customize this
      attributes: attributes || [
        {
          trait_type: "Type",
          value: "Custom Upload",
        },
        {
          trait_type: "Created",
          value: new Date().toISOString().split('T')[0], // Current date
        },
      ],
    };

    // Upload metadata to IPFS
    const result = await ipfsClient.add(JSON.stringify(metadata));
    
    return Response.json({ 
      success: true, 
      metadataHash: result.path,
      metadata 
    });
  } catch (error) {
    console.error("Error creating NFT metadata:", error);
    return Response.json({ error: "Error creating NFT metadata" }, { status: 500 });
  }
}